/**
 * Tokenizes a file query string into a stream of tokens.
 *
 * ## Syntax
 *
 * - `(` / `)` — grouping (LPAREN / RPAREN)
 * - `!` — logical NOT
 * - `|` — logical OR
 * - `&` — logical AND
 * - `@<value>` — glob pattern (GLOB), e.g. `@*.ts`
 * - `<value>` — tag name (TAG), e.g. `important`
 * - Whitespace separates tokens
 *
 * ## Escape sequences
 *
 * A backslash (`\`) escapes the immediately following character:
 * - Inside a GLOB — the escaped character is appended to the glob value
 * - Inside a TAG — the escaped character is appended to the tag value
 * - Outside any token — starts a new TAG whose value begins with the escaped character
 * - A `\` not followed by any character (end of input) is silently ignored
 *
 * ## Examples
 *
 * ```
 * "foo & bar"           → TAG("foo") AND TAG("bar")
 * "@*.ts | @*.js"       → GLOB("*.ts") OR GLOB("*.js")
 * "foo\!bar"            → TAG("foo!bar")
 * "\(escaped"           → TAG("(escaped")
 * "!important"          → NOT TAG("important")
 * "(foo | bar) & baz"   → LPAREN TAG("foo") OR TAG("bar") RPAREN AND TAG("baz")
 * ```
 */
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import { identity, pipe } from "effect/Function";
import * as Stream from "effect/Stream";

import { type FileQuery } from "./Models.js";

interface _BaseToken {
	readonly start: number;
	readonly end: number;
}

/**
 * @group Models
 */
export interface GlobToken extends _BaseToken {
	readonly kind: "GLOB";
	readonly value: string;
}

/**
 * @group Models
 */
export interface TagToken extends _BaseToken {
	readonly kind: "TAG";
	readonly value: string;
}

/**
 * @group Models
 */
export interface AndToken extends _BaseToken {
	readonly kind: "AND";
}

/**
 * @group Models
 */
export interface OrToken extends _BaseToken {
	readonly kind: "OR";
}

/**
 * @group Models
 */
export interface NotToken extends _BaseToken {
	readonly kind: "NOT";
}

/**
 * @group Models
 */
export interface LParenToken extends _BaseToken {
	readonly kind: "LPAREN";
}

/**
 * @group Models
 */
export interface RParenToken extends _BaseToken {
	readonly kind: "RPAREN";
}

/**
 * @group Models
 */
export type Token =
	| GlobToken
	| TagToken
	| AndToken
	| OrToken
	| NotToken
	| LParenToken
	| RParenToken;

type _PartialToken = Omit<GlobToken, "end"> | Omit<TagToken, "end">;

interface _LexerState {
	position: number;
	mode?: "escaping";
	current: _PartialToken | null;
}

const _isEscape = (char: string) => char === "\\";
const _isLParen = (char: string) => char === "(";
const _isRParen = (char: string) => char === ")";
const _isWhitespace = (char: string) => /\s/.test(char);
const _isNot = (char: string) => char === "!";
const _isOr = (char: string) => char === "|";
const _isAnd = (char: string) => char === "&";
const _isGlobPrefix = (char: string) => char === "@";

const _values = (
	state: _LexerState,
	currentToken?: Token,
): ReadonlyArray<Token> => {
	const prevTokens = state.current
		? [
				{
					kind: state.current.kind,
					value: state.current.value,
					start: state.current.start,
					end: state.position,
				},
			]
		: [];
	return Array.appendAll(prevTokens, Array.fromNullishOr(currentToken));
};

const _flush = (
	state: _LexerState,
	next?: Token,
): readonly [_LexerState, ReadonlyArray<Token>] => [
	{ position: state.position + 1, current: null },
	_values(state, next),
];

const _accumulate = (
	state: _LexerState,
	current: _PartialToken | null,
	mode?: "escaping",
): readonly [_LexerState, ReadonlyArray<Token>] => [
	mode
		? { position: state.position + 1, current, mode }
		: { position: state.position + 1, current },
	[],
];

const _transition = (
	state: _LexerState,
	current: _PartialToken | null,
	mode?: "escaping",
): readonly [_LexerState, ReadonlyArray<Token>] => [
	mode
		? { position: state.position + 1, current, mode }
		: { position: state.position + 1, current },
	_values(state),
];

const _appendChar = (state: _LexerState, char: string): _PartialToken => {
	return state.current
		? { ...state.current, value: `${state.current.value}${char}` }
		: { kind: "TAG", start: state.position, value: char };
};

/**
 * @group Decoding
 */
export const tokenize = (query: FileQuery): ReadonlyArray<Token> => {
	const input = [...`${query}\n`];
	return pipe(
		Stream.fromIterable(input),
		Stream.mapAccum(
			() =>
				identity<_LexerState>({
					position: 0,
					current: null,
				}),
			(state, char) => {
				if (state.mode === "escaping") {
					return _accumulate(state, _appendChar(state, char));
				}

				if (_isEscape(char)) {
					const isLastChar = input.length - 2 === state.position;
					if (isLastChar) {
						return _flush(state);
					}
					return _accumulate(state, state.current, "escaping");
				}

				if (_isLParen(char)) {
					return _flush(state, {
						kind: "LPAREN",
						start: state.position,
						end: state.position + 1,
					});
				}

				if (_isRParen(char)) {
					return _flush(state, {
						kind: "RPAREN",
						start: state.position,
						end: state.position + 1,
					});
				}

				if (_isNot(char)) {
					return _flush(state, {
						kind: "NOT",
						start: state.position,
						end: state.position + 1,
					});
				}

				if (_isOr(char)) {
					return _flush(state, {
						kind: "OR",
						start: state.position,
						end: state.position + 1,
					});
				}

				if (_isAnd(char)) {
					return _flush(state, {
						kind: "AND",
						start: state.position,
						end: state.position + 1,
					});
				}

				if (_isGlobPrefix(char)) {
					return _transition(state, {
						kind: "GLOB",
						start: state.position,
						value: "",
					});
				}

				if (_isWhitespace(char)) {
					return _flush(state);
				}

				return _accumulate(state, _appendChar(state, char));
			},
		),
		Stream.runCollect,
		Effect.runSync,
	);
};

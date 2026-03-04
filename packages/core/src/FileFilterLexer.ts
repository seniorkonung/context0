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
import { pipe } from "effect/Function";
import * as Stream from "effect/Stream";

import { type FileQuery } from "./Models.js";

interface BaseToken {
	readonly start: number;
	readonly end: number;
}

/**
 * @group Models
 */
export interface GlobToken extends BaseToken {
	readonly kind: "GLOB";
	readonly value: string;
}

/**
 * @group Models
 */
export interface TagToken extends BaseToken {
	readonly kind: "TAG";
	readonly value: string;
}

type PartialToken = Omit<GlobToken, "end"> | Omit<TagToken, "end">;

/**
 * @group Models
 */
export interface AndToken extends BaseToken {
	readonly kind: "AND";
}

/**
 * @group Models
 */
export interface OrToken extends BaseToken {
	readonly kind: "OR";
}

/**
 * @group Models
 */
export interface NotToken extends BaseToken {
	readonly kind: "NOT";
}

/**
 * @group Models
 */
export interface LParenToken extends BaseToken {
	readonly kind: "LPAREN";
}

/**
 * @group Models
 */
export interface RParenToken extends BaseToken {
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

interface LexerState {
	position: number;
	mode?: "escaping";
	current: PartialToken | null;
}

const isEscape = (char: string) => char === "\\";
const isLParen = (char: string) => char === "(";
const isRParen = (char: string) => char === ")";
const isWhitespace = (char: string) => /\s/.test(char);
const isNot = (char: string) => char === "!";
const isOr = (char: string) => char === "|";
const isAnd = (char: string) => char === "&";
const isGlobPrefix = (char: string) => char === "@";

/**
 * @group Decoding
 */
export const tokenize = (query: FileQuery): ReadonlyArray<Token> => {
	const values = (
		state: LexerState,
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

	const flush = (
		state: LexerState,
		next?: Token,
	): readonly [LexerState, ReadonlyArray<Token>] => [
		{ position: state.position + 1, current: null },
		values(state, next),
	];

	const accumulate = (
		state: LexerState,
		current: PartialToken | null,
		mode?: "escaping",
	): readonly [LexerState, ReadonlyArray<Token>] => [
		mode
			? { position: state.position + 1, current, mode }
			: { position: state.position + 1, current },
		[],
	];

	const transition = (
		state: LexerState,
		current: PartialToken | null,
		mode?: "escaping",
	): readonly [LexerState, ReadonlyArray<Token>] => [
		mode
			? { position: state.position + 1, current, mode }
			: { position: state.position + 1, current },
		values(state),
	];

	const appendChar = (state: LexerState, char: string): PartialToken => {
		return state.current
			? { ...state.current, value: `${state.current.value}${char}` }
			: { kind: "TAG", start: state.position, value: char };
	};

	const input = [...`${query}\n`];
	return pipe(
		Stream.fromIterable(input),
		Stream.mapAccum(
			(): LexerState => ({
				position: 0,
				current: null,
			}),
			(state, char) => {
				if (state.mode === "escaping") {
					return accumulate(state, appendChar(state, char));
				}

				if (isEscape(char)) {
					const isLastChar = input.length - 2 === state.position;
					if (isLastChar) {
						return flush(state);
					}
					return accumulate(state, state.current, "escaping");
				}

				if (isLParen(char)) {
					return flush(state, {
						kind: "LPAREN",
						start: state.position,
						end: state.position + 1,
					});
				}

				if (isRParen(char)) {
					return flush(state, {
						kind: "RPAREN",
						start: state.position,
						end: state.position + 1,
					});
				}

				if (isNot(char)) {
					return flush(state, {
						kind: "NOT",
						start: state.position,
						end: state.position + 1,
					});
				}

				if (isOr(char)) {
					return flush(state, {
						kind: "OR",
						start: state.position,
						end: state.position + 1,
					});
				}

				if (isAnd(char)) {
					return flush(state, {
						kind: "AND",
						start: state.position,
						end: state.position + 1,
					});
				}

				if (isGlobPrefix(char)) {
					return transition(state, {
						kind: "GLOB",
						start: state.position,
						value: "",
					});
				}

				if (isWhitespace(char)) {
					return flush(state);
				}

				return accumulate(state, appendChar(state, char));
			},
		),
		Stream.runCollect,
		Effect.runSync,
	);
};

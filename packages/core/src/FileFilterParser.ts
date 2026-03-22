import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import { identity, pipe } from "effect/Function";
import * as Match from "effect/Match";
import type * as Result from "effect/Result";
import * as SchemaIssue from "effect/SchemaIssue";
import * as SchemaParser from "effect/SchemaParser";
import * as Stream from "effect/Stream";

import { InvalidFileQuery } from "./Errors.js";
import * as FileFilterLexer from "./FileFilterLexer.js";
import { type FileQuery, Pattern, Tag } from "./Models.js";

/**
 * @group Models
 */
export type Command =
	| { readonly kind: "TAG"; readonly value: Tag }
	| { readonly kind: "GLOB"; readonly value: Pattern }
	| { readonly kind: "AND" | "OR" | "NOT" };

/**
 * @group Models
 */
export type Stack = ReadonlyArray<Command>;

type _OperatorToken =
	| FileFilterLexer.AndToken
	| FileFilterLexer.NotToken
	| FileFilterLexer.OrToken
	| FileFilterLexer.LParenToken;

interface _ParseState {
	readonly lastKind: FileFilterLexer.Token["kind"] | null;
	readonly operatorsStack: ReadonlyArray<_OperatorToken>;
	readonly index: number;
}

const _isOperand = (kind: string): kind is "GLOB" | "TAG" => {
	return kind === "GLOB" || kind === "TAG";
};
const _isBinary = (kind: string): kind is "AND" | "OR" => {
	return kind === "AND" || kind === "OR";
};
const _isNot = (kind: string): kind is "NOT" => {
	return kind === "NOT";
};
const _isLParen = (kind: string): kind is "LPAREN" => {
	return kind === "LPAREN";
};
const _isRParen = (kind: string): kind is "RPAREN" => {
	return kind === "RPAREN";
};

const _PRECEDENCE = {
	NOT: 3,
	AND: 2,
	OR: 1,
};

const _makeFail =
	(query: FileQuery) =>
	({ start, end }: FileFilterLexer.Token, reason?: SchemaIssue.Issue) => {
		return Effect.fail(
			new InvalidFileQuery(
				reason
					? {
							query,
							start,
							end,
							reason,
						}
					: { query, start, end },
			),
		);
	};

const _succeed = (
	state: _ParseState,
	token: FileFilterLexer.Token | { readonly kind: "END" },
	opts: {
		readonly nextStack?: _ParseState["operatorsStack"];
		readonly commands?: Stack;
	},
) => {
	return Effect.succeed([
		identity<_ParseState>({
			operatorsStack: opts.nextStack ?? state.operatorsStack,
			index: state.index + 1,
			lastKind: token.kind === "END" ? null : token.kind,
		}),
		identity<Stack>(opts.commands ?? []),
	] as const);
};

/**
 * @group Decoding
 */
export const parse = (
	query: FileQuery,
): Result.Result<Stack, InvalidFileQuery> => {
	const _fail = _makeFail(query);
	const tokens = [...FileFilterLexer.tokenize(query), { kind: "END" as const }];
	return pipe(
		Stream.fromIterable(tokens),
		Stream.mapAccumEffect(
			() =>
				identity<_ParseState>({
					lastKind: null,
					index: 0,
					operatorsStack: [],
				}),
			(state, token) => {
				if (token.kind === "END") {
					const lparenIdx = Array.findLastIndex(
						state.operatorsStack,
						({ kind }) => _isLParen(kind),
					);
					if (lparenIdx._tag === "Some") {
						return _fail(state.operatorsStack[lparenIdx.value]);
					}

					const commands = pipe(
						state.operatorsStack,
						Array.reverse,
						Array.map(({ kind }): Command => {
							return {
								kind: kind as Exclude<typeof kind, "LPAREN">,
							};
						}),
					);

					return _succeed(state, token, {
						nextStack: [],
						commands,
					});
				}

				const tokenKind = token.kind;
				if (state.lastKind) {
					// Нельзя два операнда подряд (TAG TAG, GLOB TAG и т.д.)
					if (_isOperand(state.lastKind) && _isOperand(tokenKind)) {
						return _fail(token);
					}
					// Нельзя два бинарных оператора подряд (AND OR)
					if (_isBinary(state.lastKind) && _isBinary(tokenKind)) {
						return _fail(token);
					}
					// Оператор после открывающей скобки (кроме NOT)
					if (_isLParen(state.lastKind) && _isBinary(tokenKind)) {
						return _fail(token);
					}
					// Оператор после закрывающей скобки (кроме NOT)
					if (_isRParen(state.lastKind) && !_isBinary(tokenKind)) {
						return _fail(token);
					}
				} else {
					// Первый токен не может быть бинарным оператором
					if (_isBinary(tokenKind)) {
						return _fail(token);
					}
				}

				// Последний токен должен быть операндом или закрывающей скобкой
				const isLastToken = tokens.length - 2 === state.index;
				if (isLastToken && !_isOperand(tokenKind) && !_isRParen(tokenKind)) {
					return _fail(token);
				}

				if (_isOperand(tokenKind)) {
					return Match.value(token).pipe(
						Match.discriminators("kind")({
							GLOB: ({ value }) =>
								SchemaParser.decodeEffect(Pattern)(value).pipe(
									Effect.catchIf(SchemaIssue.isIssue, (reason) =>
										_fail(token, reason),
									),
									Effect.map(
										(value): Command => ({
											kind: "GLOB",
											value,
										}),
									),
								),
							TAG: ({ value }) =>
								SchemaParser.decodeEffect(Tag)(value).pipe(
									Effect.catchIf(SchemaIssue.isIssue, (reason) =>
										_fail(token, reason),
									),
									Effect.map(
										(value): Command => ({
											kind: "TAG",
											value,
										}),
									),
								),
						}),
						Match.orElseAbsurd,
						Effect.andThen((command) =>
							_succeed(state, token, {
								commands: [command],
							}),
						),
					);
				}

				if (_isLParen(tokenKind)) {
					return _succeed(state, token, {
						nextStack: Array.append(state.operatorsStack, {
							...token,
							kind: tokenKind, // Только ради сохранения типобезопасности
						}),
					});
				}

				if (_isRParen(tokenKind)) {
					const lparenIdx = Array.findLastIndex(
						state.operatorsStack,
						({ kind }) => _isLParen(kind),
					);
					if (lparenIdx._tag === "None") {
						return _fail(token);
					}

					const commands = pipe(
						state.operatorsStack.slice(lparenIdx.value + 1),
						Array.reverse,
						Array.map(({ kind }): Command => {
							return {
								kind: kind as Exclude<typeof kind, "LPAREN">,
							};
						}),
					);

					return _succeed(state, token, {
						nextStack: state.operatorsStack.slice(0, lparenIdx.value),
						commands,
					});
				}

				if (_isBinary(tokenKind) || _isNot(tokenKind)) {
					const splitIdx = pipe(
						state.operatorsStack,
						Array.findLastIndex(({ kind }) => {
							return (
								kind === "LPAREN" || _PRECEDENCE[kind] < _PRECEDENCE[tokenKind]
							);
						}),
					);
					const boundaryIdx = splitIdx._tag === "None" ? -1 : splitIdx.value;
					const commands = pipe(
						state.operatorsStack.slice(boundaryIdx + 1),
						Array.reverse,
						Array.map(({ kind }) => ({
							kind: kind as Exclude<typeof kind, "LPAREN">,
						})),
					);
					return _succeed(state, token, {
						nextStack: Array.append(
							state.operatorsStack.slice(0, boundaryIdx + 1),
							{
								...token,
								kind: tokenKind, // Только ради сохранения типобезопасности
							},
						),
						commands,
					});
				}
				return Effect.die(identity<never>(tokenKind));
			},
		),
		Stream.runCollect,
		Effect.result,
		Effect.runSync,
	);
};

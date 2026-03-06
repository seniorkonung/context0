import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import { pipe } from "effect/Function";
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

type OperatorToken =
	| FileFilterLexer.AndToken
	| FileFilterLexer.NotToken
	| FileFilterLexer.OrToken
	| FileFilterLexer.LParenToken;

interface ParseState {
	readonly lastKind: FileFilterLexer.Token["kind"] | null;
	readonly operatorsStack: ReadonlyArray<OperatorToken>;
	readonly index: number;
}

const isOperand = (kind: string): kind is "GLOB" | "TAG" => {
	return kind === "GLOB" || kind === "TAG";
};
const isBinary = (kind: string): kind is "AND" | "OR" => {
	return kind === "AND" || kind === "OR";
};
const isNot = (kind: string): kind is "NOT" => {
	return kind === "NOT";
};
const isLParen = (kind: string): kind is "LPAREN" => {
	return kind === "LPAREN";
};
const isRParen = (kind: string): kind is "RPAREN" => {
	return kind === "RPAREN";
};

const PRECEDENCE = {
	NOT: 3,
	AND: 2,
	OR: 1,
};

/**
 * @group Decoding
 */
export const parse = (
	query: FileQuery,
): Result.Result<Stack, InvalidFileQuery> => {
	const fail = (
		{ start, end }: FileFilterLexer.Token,
		reason?: SchemaIssue.Issue,
	) => {
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

	const succeed = (
		state: ParseState,
		token: FileFilterLexer.Token | { readonly kind: "END" },
		opts: {
			readonly nextStack?: ParseState["operatorsStack"];
			readonly commands?: Stack;
		},
	) => {
		return Effect.succeed([
			{
				operatorsStack: opts.nextStack ?? state.operatorsStack,
				index: state.index + 1,
				lastKind: token.kind === "END" ? null : token.kind,
			} satisfies ParseState,
			opts.commands ?? ([] satisfies Stack),
		] as const);
	};

	const findLParen = (stack: ReadonlyArray<OperatorToken>) => {
		return pipe(
			stack,
			Array.findLastIndex(({ kind }) => isLParen(kind)),
		);
	};

	const tokens = [...FileFilterLexer.tokenize(query), { kind: "END" as const }];
	return pipe(
		Stream.fromIterable(tokens),
		Stream.mapAccumEffect(
			(): ParseState => ({
				lastKind: null,
				index: 0,
				operatorsStack: [],
			}),
			(state, token) => {
				if (token.kind === "END") {
					const lparenIdx = findLParen(state.operatorsStack);
					if (lparenIdx !== undefined) {
						return fail(state.operatorsStack[lparenIdx]);
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

					return succeed(state, token, {
						nextStack: [],
						commands,
					});
				}

				const tokenKind = token.kind;

				if (state.lastKind) {
					// Нельзя два операнда подряд (TAG TAG, GLOB TAG и т.д.)
					if (isOperand(state.lastKind) && isOperand(tokenKind)) {
						return fail(token);
					}
					// Нельзя два бинарных оператора подряд (AND OR)
					if (isBinary(state.lastKind) && isBinary(tokenKind)) {
						return fail(token);
					}
					// Оператор после открывающей скобки (кроме NOT)
					if (isLParen(state.lastKind) && isBinary(tokenKind)) {
						return fail(token);
					}
					// Оператор после закрывающей скобки (кроме NOT)
					if (isRParen(state.lastKind) && !isBinary(tokenKind)) {
						return fail(token);
					}
				} else {
					// Первый токен не может быть бинарным оператором
					if (isBinary(tokenKind)) {
						return fail(token);
					}
				}

				// Последний токен должен быть операндом или закрывающей скобкой
				const isLastToken = tokens.length - 2 === state.index;
				if (isLastToken && !isOperand(tokenKind) && !isRParen(tokenKind)) {
					return fail(token);
				}

				if (isOperand(tokenKind)) {
					const command = Match.value(token).pipe(
						Match.when({ kind: "GLOB" }, ({ value }) =>
							SchemaParser.decodeEffect(Pattern)(value).pipe(
								Effect.catchIf(SchemaIssue.isIssue, (reason) =>
									fail(token, reason),
								),
								Effect.map(
									(value): Command => ({
										kind: "GLOB",
										value,
									}),
								),
							),
						),
						Match.when({ kind: "TAG" }, ({ value }) =>
							SchemaParser.decodeEffect(Tag)(value).pipe(
								Effect.catchIf(SchemaIssue.isIssue, (reason) =>
									fail(token, reason),
								),
								Effect.map(
									(value): Command => ({
										kind: "TAG",
										value,
									}),
								),
							),
						),
						Match.orElseAbsurd,
					);
					return command.pipe(
						Effect.andThen((command) => {
							return succeed(state, token, {
								commands: [command],
							});
						}),
					);
				}

				if (isLParen(tokenKind)) {
					return succeed(state, token, {
						nextStack: Array.append(state.operatorsStack, {
							...token,
							kind: tokenKind, // Только ради сохранения типобезопасности
						}),
					});
				}

				if (isRParen(tokenKind)) {
					const lparenIdx = findLParen(state.operatorsStack);
					if (lparenIdx === undefined) {
						return fail(token);
					}

					const commands = pipe(
						state.operatorsStack.slice(lparenIdx + 1),
						Array.reverse,
						Array.map(({ kind }): Command => {
							return {
								kind: kind as Exclude<typeof kind, "LPAREN">,
							};
						}),
					);

					return succeed(state, token, {
						nextStack: state.operatorsStack.slice(0, lparenIdx),
						commands,
					});
				}

				if (isBinary(tokenKind) || isNot(tokenKind)) {
					tokenKind;
					const splitIdx = pipe(
						state.operatorsStack,
						Array.findLastIndex(({ kind }) => {
							return (
								kind === "LPAREN" || PRECEDENCE[kind] < PRECEDENCE[tokenKind]
							);
						}),
					);

					const boundaryIdx = splitIdx === undefined ? -1 : splitIdx;

					const commands = pipe(
						state.operatorsStack.slice(boundaryIdx + 1),
						Array.reverse,
						Array.map(({ kind }) => ({
							kind: kind as Exclude<typeof kind, "LPAREN">,
						})),
					);

					return succeed(state, token, {
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
				return Effect.die(tokenKind satisfies never);
			},
		),
		Stream.runCollect,
		Effect.result,
		Effect.runSync,
	);
};

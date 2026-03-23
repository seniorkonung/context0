import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import { pipe } from "effect/Function";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as SchemaParser from "effect/SchemaParser";
import * as String from "effect/String";

import { AbsolutePath, WorkspacePath } from "./Models.js";

/**
 * @group Schemas
 */
export const FeedbackLevel = Schema.Literals(["red", "yellow", "green"])
	.pipe(Schema.encodeTo(Schema.String))
	.annotate({
		identifier: "FeedbackLevel",
	});

/**
 * @group Schemas
 */
export const FeedbackSummary = Schema.String.check(
	Schema.isMaxLength(80),
	Schema.isPattern(/^[^\n\r]*$/),
).annotate({
	identifier: "FeedbackSummary",
});

/**
 * @group Models
 * @group Schemas
 */
export class FeedbackItem extends Schema.Class<FeedbackItem>("FeedbackItem")(
	Schema.Struct({
		_tag: Schema.Literal("FeedbackItem").pipe(
			Schema.withDecodingDefaultKey(() => "FeedbackItem", {
				encodingStrategy: "omit",
			}),
		),
		level: FeedbackLevel.pipe(Schema.OptionFromNullishOr),
		contextFile: WorkspacePath.pipe(Schema.OptionFromNullishOr),
		summary: FeedbackSummary.pipe(Schema.OptionFromNullishOr),
		text: Schema.String,
	}).annotate({ identifier: "FeedbackItem" }),
) {}

/**
 * @group Schemas
 */
export const Feedback = Schema.Array(FeedbackItem).annotate({
	identifier: "Feedback",
});

/**
 * @group Models
 */
export type Feedback = typeof Feedback.Type;

/**
 * @group Constants
 */
export const FEEDBACK_ITEM_SEPARATOR = "----------- NEXT FEEDBACK -----------";

/**
 * @group Constants
 */
export const FEEDBACK_SECTION_SEPARATOR =
	"-------------------------------------";

/**
 * @group Decoding
 */
export const fromLlmOutput = Effect.fnUntraced(function* (
	input: string,
	rootDir: AbsolutePath,
) {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;

	return yield* Effect.forEach(
		input
			.split(new RegExp(`^\\s*${FEEDBACK_ITEM_SEPARATOR}\\s*$`, "m"))
			.filter((raw) => raw.trim().length > 0),
		Effect.fnUntraced(function* (rawFeedback) {
			const [rawAttributes, text] = pipe(
				rawFeedback,
				String.split(
					new RegExp(`^\\s*${FEEDBACK_SECTION_SEPARATOR}\\s*$`, "m"),
				),
				([attributes, ...tail]) => [attributes, tail.join("")] as const,
			);

			const level = Option.fromNullishOr(
				rawAttributes.match(/^LEVEL=(.*)$/m),
			).pipe(
				Option.flatMap(Array.get(1)),
				Option.map(String.toLowerCase),
				Option.flatMap(SchemaParser.decodeOption(FeedbackLevel)),
			);

			const contextFile = yield* Option.fromNullishOr(
				rawAttributes.match(/^CONTEXT_FILE=(.*)$/m),
			).pipe(
				Option.flatMap(Array.get(1)),
				Effect.fromOption,
				Effect.andThen(
					Effect.fnUntraced(function* (relativePath) {
						const absolutePath = AbsolutePath.makeUnsafe(
							path.resolve(rootDir, relativePath),
						);
						const contextFileExists = yield* fs.exists(absolutePath);
						if (contextFileExists) {
							return yield* Result.succeed(
								WorkspacePath.makeUnsafe(absolutePath.replace(rootDir, "/")),
							);
						}
						return yield* Result.failVoid;
					}),
				),
				Effect.option,
			);

			const summary = Option.fromNullishOr(
				rawAttributes.match(/^SUMMARY=(.*)$/m),
			).pipe(
				Option.flatMap(Array.get(1)),
				Option.flatMap(SchemaParser.decodeOption(FeedbackSummary)),
			);

			return FeedbackItem.makeUnsafe({
				_tag: "FeedbackItem",
				contextFile,
				level,
				summary,
				text: text.trim(),
			});
		}),
	);
});

import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import { pipe } from "effect/Function";
import * as Record from "effect/Record";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as SchemaIssue from "effect/SchemaIssue";
import * as SchemaParser from "effect/SchemaParser";

import {
	InvalidMarkdownAnnotations,
	MarkdownAnnotationsNotFound,
	UnresolvedTagDependency,
} from "./Errors.js";
import * as Frontmatter from "./Frontmatter.js";
import {
	type ConfigGroup,
	Pattern,
	Scope,
	Tag,
	type WorkspacePath,
} from "./Models.js";

/**
 * @group Models
 * @group Schemas
 */
export class MarkdownAnnotations extends Schema.Class<MarkdownAnnotations>(
	"MarkdownAnnotations",
)(
	Schema.Struct({
		_tag: Schema.Literal("MarkdownAnnotations").pipe(
			Schema.withDecodingDefaultKey(() => "MarkdownAnnotations", {
				encodingStrategy: "omit",
			}),
		),
		depends: Schema.Array(Tag).pipe(Schema.OptionFromOptionalKey),
		groupBy: Schema.Array(Pattern).pipe(Schema.OptionFromOptionalKey),
		description: Schema.String.pipe(Schema.OptionFromOptionalKey),
		scope: Scope,
		tags: Schema.Array(Tag),
	}).annotate({ identifier: "MarkdownAnnotations" }),
) {}

/**
 * @group Decoding
 */
export const fromMarkdown = (
	markdown: string,
	file: WorkspacePath,
	configGroup: ConfigGroup,
): Result.Result<
	MarkdownAnnotations,
	| InvalidMarkdownAnnotations
	| MarkdownAnnotationsNotFound
	| UnresolvedTagDependency
> => {
	const annotations = Effect.fromOption(Frontmatter.load(markdown)).pipe(
		Effect.andThen(SchemaParser.decodeUnknownEffect(MarkdownAnnotations)),
		Effect.catchIf(SchemaIssue.isIssue, (reason) =>
			new InvalidMarkdownAnnotations({ reason }).asEffect(),
		),
		Effect.catchTags({
			NoSuchElementError: () =>
				new MarkdownAnnotationsNotFound({ file }).asEffect(),
		}),
		Effect.result,
		Effect.runSync,
	);

	if (annotations._tag === "Failure") return annotations;

	const deps = pipe(
		Array.fromOption(annotations.success.depends),
		Array.flatten,
		Array.appendAll(annotations.success.tags),
	);

	for (const dep of deps) {
		if (Record.has(configGroup.tagMap, dep)) continue;
		return Result.fail(
			new UnresolvedTagDependency({
				tag: dep,
				referencedBy: file,
			}),
		);
	}

	return annotations;
};

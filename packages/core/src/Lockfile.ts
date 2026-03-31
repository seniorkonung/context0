import * as Array from "effect/Array";
import * as Boolean from "effect/Boolean";
import * as Filter from "effect/Filter";
import { pipe } from "effect/Function";
import * as Option from "effect/Option";
import * as Record from "effect/Record";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as SchemaParser from "effect/SchemaParser";

import { LockInfoNotFound } from "./Errors.js";
import { MarkdownAnnotations } from "./MarkdownAnnotations.js";
import { RelativePath, Tag, WorkspacePath } from "./Models.js";
import * as YamlSerializer from "./YamlSerializer.js";

/**
 * @group Models
 * @group Schemas
 */
export class Lockfile extends Schema.Opaque<Lockfile>()(
	Schema.Record(
		RelativePath,
		Schema.Struct({
			tags: Schema.Array(Tag),
			annotations: MarkdownAnnotations.pipe(Schema.OptionFromOptionalKey),
		}),
	).annotate({
		identifier: "Lockfile",
	}),
) {}

/**
 * @group Encoding
 */
export const toString = (lockfile: Lockfile): string => {
	const obj = SchemaParser.encodeSync(Lockfile)(lockfile);
	return YamlSerializer.serialize(obj);
};

/**
 * @group Accessors
 */
export const fileInfo = (
	lockfile: Lockfile,
	file: WorkspacePath,
): Result.Result<Lockfile[RelativePath], LockInfoNotFound> => {
	const relativePath = RelativePath.makeUnsafe(file.slice(2));
	return Record.get(lockfile, relativePath).pipe(
		Result.fromOption(() => new LockInfoNotFound({ file })),
	);
};

/**
 * @group Accessors
 */
export const fileContext = (
	lockfile: Lockfile,
	file: WorkspacePath,
): Result.Result<ReadonlyArray<WorkspacePath>, LockInfoNotFound> => {
	const lockinfo = fileInfo(lockfile, file);
	if (lockinfo._tag === "Failure") return Result.fail(lockinfo.failure);

	const tags = lockinfo.success.tags;
	const context = pipe(
		Record.toEntries(lockfile),
		Array.filterMap(
			Filter.fromPredicateOption(([file, { annotations }]) => {
				if (annotations._tag === "None") return Option.none();
				return pipe(
					annotations.value.tags.every((tag) => tags.includes(tag)),
					Boolean.or(Array.isReadonlyArrayEmpty(annotations.value.tags)),
					Boolean.match({
						onFalse: Option.none,
						onTrue: () => Option.some(WorkspacePath.makeUnsafe(`//${file}`)),
					}),
				);
			}),
		),
	);

	return Result.succeed(context);
};

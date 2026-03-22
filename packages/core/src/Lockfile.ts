import * as Array from "effect/Array";
import * as Boolean from "effect/Boolean";
import * as Effect from "effect/Effect";
import * as Filter from "effect/Filter";
import { pipe } from "effect/Function";
import * as HashSet from "effect/HashSet";
import * as Option from "effect/Option";
import * as Record from "effect/Record";
import * as Ref from "effect/Ref";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as SchemaParser from "effect/SchemaParser";
import picomatch from "picomatch";

import { LockInfoNotFound } from "./Errors.js";
import { Hash } from "./Hash.js";
import { MarkdownAnnotations } from "./MarkdownAnnotations.js";
import { RelativePath, type Scope, Tag, WorkspacePath } from "./Models.js";
import * as YamlSerializer from "./YamlSerializer.js";

/**
 * @group Models
 * @group Schemas
 */
export class Lockfile extends Schema.Opaque<Lockfile>()(
	Schema.Record(
		RelativePath,
		Schema.Struct({
			hash: Hash.pipe(Schema.OptionFromOptionalKey),
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
	targetScope: Scope,
): Result.Result<ReadonlyArray<WorkspacePath>, LockInfoNotFound> => {
	const lockinfo = fileInfo(lockfile, file);
	if (lockinfo._tag === "Failure") return Result.fail(lockinfo.failure);

	const tags = lockinfo.success.tags;
	const context = pipe(
		Record.toEntries(lockfile),
		Array.filterMap(
			Filter.fromPredicateOption(([file, { annotations }]) => {
				if (annotations._tag === "None") return Option.none();
				if (
					annotations.value.scope !== "all" &&
					targetScope !== "all" &&
					!annotations.value.scope.some((scope) => targetScope.includes(scope))
				) {
					return Option.none();
				}
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

/**
 * @group Accessors
 */
export const dependencyGroups = (
	lockfile: Lockfile,
	{ depends, groupBy }: MarkdownAnnotations,
): ReadonlyArray<HashSet.HashSet<WorkspacePath>> => {
	const leftoversRef = pipe(
		Record.toEntries(lockfile),
		Array.filter(([_, { tags }]) => {
			if (depends._tag === "None") return false;
			if (depends.value.length === 0) return true;
			return tags.some((tag) => {
				return depends.value.includes(tag);
			});
		}),
		Array.map(([relativePath]) =>
			WorkspacePath.makeUnsafe(`//${relativePath}`),
		),
		HashSet.fromIterable,
		Ref.makeUnsafe,
	);

	if (groupBy._tag === "None") return [];
	if (groupBy.value.length === 0) {
		return [Ref.get(leftoversRef).pipe(Effect.runSync)];
	}

	return pipe(
		groupBy.value,
		Array.map((pattern) => {
			const isMatch = picomatch(pattern, {
				dot: true,
			});
			const matched = HashSet.filter(
				Ref.get(leftoversRef).pipe(Effect.runSync),
				isMatch,
			);
			Ref.update(leftoversRef, HashSet.difference(matched)).pipe(
				Effect.runSync,
			);
			return matched;
		}),
		Array.append(Ref.get(leftoversRef).pipe(Effect.runSync)),
	);
};

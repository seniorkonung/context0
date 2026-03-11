import * as Data from "effect/Data";
import type * as SchemaIssue from "effect/SchemaIssue";

import {
	type AbsolutePath,
	type FileQuery,
	type Tag,
	type WorkspacePath,
} from "./Models.js";

/**
 * @group Errors
 */
export class RootDirNotFound extends Data.TaggedError("RootDirNotFound")<{
	readonly startDir: AbsolutePath;
}> {}

/**
 * @group Errors
 */
export class FileNotFound extends Data.TaggedError("FileNotFound")<{
	readonly file: AbsolutePath;
}> {}

/**
 * @group Errors
 */
export class RootDirAlreadyDefined extends Data.TaggedError(
	"RootDirAlreadyDefined",
)<{
	readonly currentDir: AbsolutePath;
	readonly parentRootDir: AbsolutePath;
}> {}

/**
 * @group Errors
 */
export class InvalidLockfile extends Data.TaggedError("InvalidLockfile")<{
	readonly reason: SchemaIssue.Issue;
}> {}

/**
 * @group Errors
 */
export class InvalidRootConfig extends Data.TaggedError("InvalidRootConfig")<{
	readonly reason: SchemaIssue.Issue;
}> {}

/**
 * @group Errors
 */
export class InvalidEntrypointConfig extends Data.TaggedError(
	"InvalidEntrypointConfig",
)<{
	readonly reason: SchemaIssue.Issue;
}> {}

/**
 * @group Errors
 */
export class InvalidMarkdownAnnotations extends Data.TaggedError(
	"InvalidMarkdownAnnotations",
)<{
	readonly reason: SchemaIssue.Issue;
}> {}

/**
 * @group Errors
 */
export class MarkdownAnnotationsNotFound extends Data.TaggedError(
	"MarkdownAnnotationsNotFound",
)<{
	readonly file: WorkspacePath;
}> {}

/**
 * @group Errors
 */
export class CyclicTagDependency extends Data.TaggedError(
	"CyclicTagDependency",
)<{
	readonly cycles: ReadonlyArray<ReadonlyArray<Tag>>;
}> {}

/**
 * @group Errors
 */
export class DuplicateTagDefinition extends Data.TaggedError(
	"DuplicateTagDefinition",
)<{
	readonly tag: Tag;
}> {}

/**
 * @group Errors
 */
export class UnresolvedTagDependency extends Data.TaggedError(
	"UnresolvedTagDependency",
)<{
	readonly tag: Tag;
	readonly referencedBy: Tag | WorkspacePath;
}> {}

/**
 * @group Errors
 */
export class InvalidFileQuery extends Data.TaggedError("InvalidFileQuery")<{
	readonly query: FileQuery;
	readonly start: number;
	readonly end: number;
	readonly reason?: SchemaIssue.Issue;
}> {}

/**
 * @group Errors
 */
// biome-ignore lint/complexity/noBannedTypes: Никаких методанных не требуется
export class ShellNotFound extends Data.TaggedError("ShellNotFound")<{}> {}

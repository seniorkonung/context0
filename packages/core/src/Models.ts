import * as Schema from "effect/Schema";
import * as Struct from "effect/Struct";

/**
 * @group Schemas
 */
export const Pattern = Schema.NonEmptyString.pipe(
	Schema.brand("Pattern"),
).annotate({ identifier: "Pattern" });

/**
 * @group Models
 */
export type Pattern = Schema.Schema.Type<typeof Pattern>;

/**
 * @group Schemas
 */
export const RelativePath = Schema.String.pipe(
	Schema.check(Schema.isPattern(/^[^/]/)),
	Schema.brand("RelativePath"),
).annotate({
	identifier: "RelativePath",
});

/**
 * @group Models
 */
export type RelativePath = Schema.Schema.Type<typeof RelativePath>;

/**
 * @group Schemas
 */
export const AbsolutePath = Schema.String.pipe(
	Schema.check(Schema.isPattern(/^\/[^/]/)),
	Schema.brand("AbsolutePath"),
).annotate({
	identifier: "AbsolutePath",
});

/**
 * @group Models
 */
export type AbsolutePath = Schema.Schema.Type<typeof AbsolutePath>;

/**
 * @group Schemas
 */
export const WorkspacePath = Schema.String.pipe(
	Schema.check(Schema.isStartsWith("//")),
	Schema.brand("WorkspacePath"),
).annotate({
	identifier: "WorkspacePath",
});

/**
 * @group Models
 */
export type WorkspacePath = Schema.Schema.Type<typeof WorkspacePath>;

/**
 * @group Schemas
 */
export const Hash = Schema.NonEmptyString.pipe(Schema.brand("Hash")).annotate({
	identifier: "Hash",
});

/**
 * @group Models
 */
export type Hash = Schema.Schema.Type<typeof Hash>;

/**
 * @group Schemas
 */
export const Tag = Schema.NonEmptyString.pipe(Schema.brand("Tag")).annotate({
	identifier: "Tag",
});
/**
 * @group Models
 */
export type Tag = Schema.Schema.Type<typeof Tag>;

/**
 * @group Schemas
 */
export const TagFilter = Schema.NonEmptyString.pipe(
	Schema.brand("TagFilter"),
).annotate({
	identifier: "TagFilter",
});
/**
 * @group Models
 */
export type TagFilter = Schema.Schema.Type<typeof TagFilter>;

/**
 * @group Schemas
 */
export const Command = Schema.NonEmptyString.pipe(
	Schema.brand("Command"),
).annotate({
	identifier: "Command",
});

/**
 * @group Models
 */
export type Command = Schema.Schema.Type<typeof Command>;

/**
 * @group Schemas
 */
export const Scope = Schema.Union([
	Schema.Literal("all"),
	Schema.Array(Schema.Literals(["write", "read", "create", "delete"])),
]).annotate({ identifier: "Scope" });

/**
 * @group Models
 */
export type Scope = Schema.Schema.Type<typeof Scope>;

/**
 * @group Models
 */
export type CheckStep =
	| { not: CheckStep }
	| { glob: Pattern }
	| { basenamePattern: Pattern }
	| { tags: ReadonlyArray<Tag> }
	| { cmd: Command | { run: Command; with?: unknown } };

type CheckStepEncoded =
	| { not: CheckStepEncoded }
	| { glob: Schema.Codec.Encoded<typeof Pattern> }
	| { basenamePattern: Schema.Codec.Encoded<typeof Pattern> }
	| { tags: ReadonlyArray<Schema.Codec.Encoded<typeof Tag>> }
	| {
			cmd:
				| Schema.Codec.Encoded<typeof Command>
				| { run: Schema.Codec.Encoded<typeof Command>; with?: unknown };
	  };

/**
 * @group Schemas
 */
export const CheckStep = Schema.Union([
	Schema.Struct({
		not: Schema.suspend(
			(): Schema.Codec<CheckStep, CheckStepEncoded> => CheckStep,
		),
	}),
	Schema.Struct({ glob: Pattern }),
	Schema.Struct({ basenamePattern: Pattern }),
	Schema.Struct({ tags: Schema.Array(Tag) }),
	Schema.Struct({
		cmd: Schema.Union([
			Command,
			Schema.Struct({
				run: Command,
				with: Schema.optionalKey(Schema.Unknown),
			}),
		]),
	}),
]).annotate({ identifier: "CheckStep" }) satisfies Schema.Codec<
	CheckStep,
	unknown
>;

/**
 * @group Models
 * @group Schemas
 */
export class RootConfig extends Schema.Class<RootConfig>("RootConfig")(
	Schema.Struct({
		_tag: Schema.Literal("RootConfig").pipe(
			Schema.withDecodingDefaultKey(() => "RootConfig", {
				encodingStrategy: "omit",
			}),
		),
		constraints: Schema.Array(
			Schema.Struct({
				glob: Pattern,
				tags: Schema.Array(Tag),
			}),
		).pipe(Schema.OptionFromOptionalKey),
		entrypoints: Schema.Array(Pattern).pipe(Schema.OptionFromOptionalKey),
		tags: Schema.Record(
			Tag,
			Schema.Struct({
				checks: Schema.Array(CheckStep),
				description: Schema.String.pipe(Schema.OptionFromOptionalKey),
			}),
		).pipe(Schema.OptionFromOptionalKey),
		ignore: Schema.Array(Pattern).pipe(Schema.OptionFromOptionalKey),
	}).annotate({ identifier: "RootConfig" }),
) {}

/**
 * @group Models
 * @group Schemas
 */
export class EntrypointConfig extends Schema.Class<EntrypointConfig>(
	"EntrypointConfig",
)(
	Schema.Struct({
		...Struct.omit(RootConfig.fields, ["entrypoints", "_tag"]),
		_tag: Schema.Literal("EntrypointConfig").pipe(
			Schema.withDecodingDefaultKey(() => "EntrypointConfig", {
				encodingStrategy: "omit",
			}),
		),
	}).annotate({ identifier: "RootConfig" }),
) {}

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
 * @group Models
 * @group Schemas
 */
export class Lockfile extends Schema.Opaque<Lockfile>()(
	Schema.Record(
		RelativePath,
		Schema.Struct({
			requiredTags: Schema.Array(Tag),
			hash: Hash.pipe(Schema.OptionFromOptionalKey),
			tags: Schema.Array(Tag),
			annotations: MarkdownAnnotations.pipe(Schema.OptionFromOptionalKey),
		}),
	).annotate({
		identifier: "Lockfile",
	}),
) {}

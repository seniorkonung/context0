import type * as Option from "effect/Option";
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
export const FileQuery = Schema.NonEmptyString.pipe(
	Schema.brand("FileQuery"),
).annotate({
	identifier: "FileQuery",
});
/**
 * @group Models
 */
export type FileQuery = Schema.Schema.Type<typeof FileQuery>;

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
 * @group Schemas
 */
export const Command = Schema.Union([
	Schema.NonEmptyString,
	Schema.Struct({
		run: Schema.NonEmptyString,
		with: Schema.optionalKey(Schema.Unknown),
		workdir: Schema.optionalKey(Schema.String),
		env: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
		debug: Schema.optionalKey(
			Schema.Literals(["all", "stdout", "stderr", "none"]),
		),
	}),
]).annotate({
	identifier: "Command",
});

/**
 * @group Models
 */
export type Command = Schema.Schema.Type<typeof Command>;

/**
 * @group Models
 */
export type CheckStep =
	| { readonly not: CheckStep }
	| { readonly oneOf: ReadonlyArray<CheckStep> }
	| { readonly anyOf: ReadonlyArray<CheckStep> }
	| { readonly allOf: ReadonlyArray<CheckStep> }
	| { readonly noneOf: ReadonlyArray<CheckStep> }
	| {
			readonly if: CheckStep;
			readonly then: CheckStep;
			readonly else?: CheckStep;
	  }
	| { readonly glob: Pattern }
	| { readonly basenamePattern: Pattern }
	| { readonly tags: ReadonlyArray<Tag> }
	| {
			readonly cmd: Command;
	  };

type CheckStepEncoded =
	| { readonly not: CheckStepEncoded }
	| { readonly oneOf: ReadonlyArray<CheckStepEncoded> }
	| { readonly anyOf: ReadonlyArray<CheckStepEncoded> }
	| { readonly allOf: ReadonlyArray<CheckStepEncoded> }
	| { readonly noneOf: ReadonlyArray<CheckStepEncoded> }
	| {
			readonly if: CheckStepEncoded;
			readonly then: CheckStepEncoded;
			readonly else?: CheckStepEncoded;
	  }
	| { readonly glob: Schema.Codec.Encoded<typeof Pattern> }
	| { readonly basenamePattern: Schema.Codec.Encoded<typeof Pattern> }
	| { readonly tags: ReadonlyArray<Schema.Codec.Encoded<typeof Tag>> }
	| {
			readonly cmd: Schema.Codec.Encoded<typeof Command>;
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
	Schema.Struct({
		oneOf: Schema.suspend(
			(): Schema.Codec<
				ReadonlyArray<CheckStep>,
				ReadonlyArray<CheckStepEncoded>
			> => Schema.Array(CheckStep),
		),
	}),
	Schema.Struct({
		anyOf: Schema.suspend(
			(): Schema.Codec<
				ReadonlyArray<CheckStep>,
				ReadonlyArray<CheckStepEncoded>
			> => Schema.Array(CheckStep),
		),
	}),
	Schema.Struct({
		allOf: Schema.suspend(
			(): Schema.Codec<
				ReadonlyArray<CheckStep>,
				ReadonlyArray<CheckStepEncoded>
			> => Schema.Array(CheckStep),
		),
	}),
	Schema.Struct({
		noneOf: Schema.suspend(
			(): Schema.Codec<
				ReadonlyArray<CheckStep>,
				ReadonlyArray<CheckStepEncoded>
			> => Schema.Array(CheckStep),
		),
	}),
	Schema.Struct({
		if: Schema.suspend(
			(): Schema.Codec<CheckStep, CheckStepEncoded> => CheckStep,
		),
		then: Schema.suspend(
			(): Schema.Codec<CheckStep, CheckStepEncoded> => CheckStep,
		),
		else: Schema.suspend(
			(): Schema.Codec<CheckStep, CheckStepEncoded> => CheckStep,
		).pipe(Schema.optionalKey),
	}),
	Schema.Struct({ glob: Pattern }),
	Schema.Struct({ tags: Schema.Array(Tag) }),
	Schema.Struct({ cmd: Command }),
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
 */
export interface ConfigGroup {
	readonly _tag: "ConfigGroup";
	readonly rootDir: AbsolutePath;
	readonly dir: AbsolutePath;
	readonly configs: ReadonlyArray<RootConfig | EntrypointConfig>;
	readonly tagMap: Option.Option.Value<RootConfig["tags"]>;
	readonly tagOrder: ReadonlyArray<Tag>;
}

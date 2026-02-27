import type * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as ServiceMap from "effect/ServiceMap";
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
export const Path = Schema.String.pipe(Schema.brand("Path")).annotate({
	identifier: "Path",
});

/**
 * @group Models
 */
export type Path = Schema.Schema.Type<typeof Path>;

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
 * @group Schemas
 */
export const RootConfig = Schema.Struct({
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
			checks: Schema.Array(
				Schema.Union([
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
				]),
			),
			description: Schema.String,
		}),
	).pipe(Schema.OptionFromOptionalKey),
}).annotate({ identifier: "RootConfig" });

/**
 * @group Models
 */
export type RootConfig = Schema.Schema.Type<typeof RootConfig>;

/**
 * @group Schemas
 */
export const EntrypointConfig = Schema.Struct({
	...Struct.omit(RootConfig.fields, ["entrypoints", "_tag"]),
	_tag: Schema.Literal("EntrypointConfig").pipe(
		Schema.withDecodingDefaultKey(() => "EntrypointConfig", {
			encodingStrategy: "omit",
		}),
	),
}).annotate({ identifier: "RootConfig" });

/**
 * @group Models
 */
export type EntrypointConfig = Schema.Schema.Type<typeof EntrypointConfig>;

/**
 * @group Schemas
 */
export const MarkdownAnnotation = Schema.Struct({
	_tag: Schema.Literal("MarkdownAnnotation").pipe(
		Schema.withDecodingDefaultKey(() => "MarkdownAnnotation", {
			encodingStrategy: "omit",
		}),
	),
	depends: Schema.Array(Tag).pipe(Schema.OptionFromOptionalKey),
	groupBy: Schema.Array(Pattern).pipe(Schema.OptionFromOptionalKey),
	scope: Scope,
	tags: Schema.Array(Tag),
}).annotate({ identifier: "MarkdownAnnotation" });

/**
 * @group Models
 */
export type MarkdownAnnotation = Schema.Schema.Type<typeof MarkdownAnnotation>;

/**
 * @group Schemas
 */
export const Lockfile = Schema.Record(
	Path,
	Schema.Struct({
		checkHash: Hash.pipe(Schema.OptionFromOptionalKey),
		requiredTags: Schema.Array(Tag),
		scanHash: Hash.pipe(Schema.OptionFromOptionalKey),
		tags: Schema.Array(Tag),
	}),
).annotate({
	identifier: "Lockfile",
});

/**
 * @group Models
 */
export type Lockfile = Schema.Schema.Type<typeof Lockfile>;

/**
 * @group Services
 */
export class Check extends ServiceMap.Service<
	Check,
	{
		readonly isSuccessful: () => Effect.Effect<boolean>;
	}
>()("Check") {}

/**
 * @group Params
 */
export type ChangeRequiredTagsParams =
	| {
			readonly op: "delete";
			readonly tags: ReadonlyArray<Tag>;
	  }
	| {
			readonly op: "add";
			readonly tags: ReadonlyArray<Tag>;
	  }
	| {
			readonly op: "sync";
			readonly tags: ReadonlyArray<Tag>;
	  };

/**
 * @group Services
 */
export class Context0 extends ServiceMap.Service<
	Context0,
	{
		/**
		 * Получить список тегов всех файлов, которые соответствуют паттернам
		 */
		readonly getTags: (
			...patterns: ReadonlyArray<Pattern>
		) => Effect.Effect<ReadonlyArray<Tag>>;
		/**
		 * Получить список файлов, которые соответствуют фильтру тегов
		 */
		readonly getFiles: (filter: TagFilter) => Effect.Effect<ReadonlyArray<Tag>>;
		/**
		 * Получить требуемые теги для конкретного файла
		 */
		readonly getRequiredTags: (file: Path) => Effect.Effect<ReadonlyArray<Tag>>;
		/**
		 * Изменить требуемые теги для конкретного файла
		 */
		readonly changeRequiredTags: (
			file: Path,
			params: ChangeRequiredTagsParams,
		) => Effect.Effect<void>;
		/**
		 * Получить все контекстные файлы, которые связаны с перечисленными тегами
		 */
		readonly getContext: (
			scope: Scope,
			...tags: ReadonlyArray<Tag>
		) => Effect.Effect<ReadonlyArray<Path>>;
		/**
		 * Синхронизировать теги на основании текущего состояния файлов
		 */
		readonly sync: () => Effect.Effect<void>;
		/**
		 * Проверить файлы на соответствие контексту и ограничениям
		 */
		readonly check: () => Effect.Effect<void>;
	}
>()("Context0") {}

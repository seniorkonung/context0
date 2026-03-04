import type * as Effect from "effect/Effect";
import * as ServiceMap from "effect/ServiceMap";

import { type SyncFailed } from "./Errors.js";
import {
	type FileQuery,
	type Pattern,
	type Scope,
	type Tag,
	type WorkspacePath,
} from "./Models.js";

/**
 * @group Namespaces
 */
export namespace Context0 {
	/**
	 * @group Params
	 */
	export type UpdateRequiredTagsParams =
		| {
				readonly _tag: "Delete";
				readonly tags: ReadonlyArray<Tag>;
		  }
		| {
				readonly _tag: "Add";
				readonly tags: ReadonlyArray<Tag>;
		  }
		| {
				readonly _tag: "Sync";
				readonly tags: ReadonlyArray<Tag>;
		  };
}

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
		readonly getFiles: (query: FileQuery) => Effect.Effect<ReadonlyArray<Tag>>;
		/**
		 * Получить требуемые теги для конкретного файла
		 */
		readonly getRequiredTags: (
			file: string,
		) => Effect.Effect<ReadonlyArray<Tag>>;
		/**
		 * Изменить требуемые теги для конкретного файла
		 */
		readonly updateRequiredTags: (
			file: string,
			action: Context0.UpdateRequiredTagsParams,
		) => Effect.Effect<void>;
		/**
		 * Получить все контекстные файлы, которые связаны с перечисленными тегами
		 */
		readonly getContext: (
			scope: Scope,
			...tags: ReadonlyArray<Tag>
		) => Effect.Effect<ReadonlyArray<WorkspacePath>>;
		/**
		 * Синхронизировать теги на основании текущего состояния файлов
		 */
		readonly sync: () => Effect.Effect<void, SyncFailed>;
		/**
		 * Проверить файлы на соответствие контексту и ограничениям
		 */
		readonly check: () => Effect.Effect<void>;
	}
>()("Context0") {}

import type * as Effect from "effect/Effect";
import * as ServiceMap from "effect/ServiceMap";

import {
	type AbsolutePath,
	type FileQuery,
	type RelativePath,
	type Tag,
	type WorkspacePath,
} from "./Models.js";

/**
 * @group Options
 */
export interface SearchOptions {
	/**
	 * @default workspace.rootDir
	 */
	readonly dir?: AbsolutePath | undefined;
}

/**
 * @group Options
 */
export interface SyncOptions {
	/**
	 * @default workspace.rootDir
	 */
	readonly dir?: AbsolutePath | undefined;
	/**
	 * @default undefined
	 */
	readonly file?: AbsolutePath | undefined;
	/**
	 * @default - Все возможные теги
	 */
	readonly tags?: ReadonlyArray<Tag> | undefined;
}

/**
 * @group Types
 */
export interface DescribeReturnType {
	readonly tags: ReadonlyArray<{
		readonly name: Tag;
		readonly description: string;
	}>;
	readonly context: ReadonlyArray<{
		readonly path: WorkspacePath;
		readonly description: string;
	}>;
}

/**
 * @group Services
 */
export class Context0 extends ServiceMap.Service<
	Context0,
	{
		readonly search: (
			query: FileQuery,
			options?: SearchOptions,
		) => Effect.Effect<
			ReadonlyArray<WorkspacePath> | ReadonlyArray<RelativePath>
		>;
		readonly describe: (
			file: AbsolutePath,
		) => Effect.Effect<DescribeReturnType>;
		readonly sync: (options?: SyncOptions) => Effect.Effect<void>;
	}
>()("Context0") {}

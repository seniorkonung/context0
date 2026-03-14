import type * as Effect from "effect/Effect";
import * as ServiceMap from "effect/ServiceMap";

import {
	type AbsolutePath,
	type FileQuery,
	type Pattern,
	type RelativePath,
	type Tag,
	type WorkspacePath,
} from "./Models.js";

/**
 * @group Namespaces
 */
export namespace Context0 {
	/**
	 * @group Options
	 */
	export interface SearchOptions {
		readonly dir?: AbsolutePath | undefined;
	}

	/**
	 * @group Options
	 */
	export interface SyncOptions {
		readonly dir?: AbsolutePath | undefined;
		readonly tags?: ReadonlyArray<Tag> | undefined;
	}

	/**
	 * @group Types
	 */
	export type SearchReturnType<TOptions> = TOptions extends {
		dir: infer D;
	}
		? [D] extends [AbsolutePath]
			? ReadonlyArray<RelativePath>
			: [D] extends [undefined]
			? ReadonlyArray<WorkspacePath>
				: ReadonlyArray<WorkspacePath | RelativePath>
		: ReadonlyArray<WorkspacePath>;

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
	 * @group Types
	 */
	export interface CheckReturnType {
		readonly isAllowed: boolean;
		readonly allowedDirs: ReadonlyArray<Pattern>;
		readonly allowedFiles: ReadonlyArray<RelativePath>;
		readonly requiredTags: ReadonlyArray<Tag>;
		readonly forbbidenTags: ReadonlyArray<Tag>;
	}
}

/**
 * @group Services
 */
export class Context0 extends ServiceMap.Service<
	Context0,
	{
		readonly search: <TOptions extends Context0.SearchOptions>(
			query: FileQuery,
			options?: TOptions,
		) => Effect.Effect<Context0.SearchReturnType<TOptions>>;
		readonly describe: (
			file: AbsolutePath,
		) => Effect.Effect<Context0.DescribeReturnType>;
		readonly check: () => Effect.Effect<void>;
		readonly review: () => Effect.Effect<void>;
		readonly sync: () => Effect.Effect<void>;
		// readonly validate: () => Effect.Effect<void>;
	}
>()("Context0") {}

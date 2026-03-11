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
	 * @group Types
	 */
	export type SearchScope = "workspace" | "cwd";

	/**
	 * @group Types
	 */
	export type SearchReturnType<TScope extends SearchScope> =
		TScope extends "workspace"
			? ReadonlyArray<WorkspacePath>
			: ReadonlyArray<RelativePath>;

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
		readonly search: <TScope extends Context0.SearchScope>(
			query: FileQuery,
			scope: TScope,
		) => Effect.Effect<Context0.SearchReturnType<TScope>>;
		readonly describe: (
			file: AbsolutePath,
		) => Effect.Effect<Context0.DescribeReturnType>;
		readonly check: () => Effect.Effect<void>;
		readonly review: () => Effect.Effect<void>;
		readonly sync: () => Effect.Effect<void>;
		// readonly validate: () => Effect.Effect<void>;
	}
>()("Context0") {}

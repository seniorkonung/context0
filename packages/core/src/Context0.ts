import type * as Effect from "effect/Effect";
import * as ServiceMap from "effect/ServiceMap";

import { type SearchFailed, type SyncFailed } from "./Errors.js";
import {
	type FileQuery,
	type RelativePath,
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
		) => Effect.Effect<Context0.SearchReturnType<TScope>, SearchFailed>;
		readonly describe: (
			file: string,
		) => Effect.Effect<ReadonlyArray<WorkspacePath>>;
		readonly sync: () => Effect.Effect<void, SyncFailed>;
		readonly validate: () => Effect.Effect<void>;
	}
>()("Context0") {}

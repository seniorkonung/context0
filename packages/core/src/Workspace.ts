import * as Data from "effect/Data";
import type * as Effect from "effect/Effect";
import type * as Option from "effect/Option";
import type * as PlatformError from "effect/PlatformError";
import * as ServiceMap from "effect/ServiceMap";

import {
	type EntrypointConfig,
	type Lockfile,
	type Path,
	type RootConfig,
} from "./Context0.js";

/**
 * @group Models
 */
export interface Workspace {
	readonly _tag: "Workspace";
	readonly rootDir: Path;
	readonly rootConfig: Option.Option<RootConfig>;
	readonly entrypoints: ReadonlyArray<{
		readonly dir: Path;
		readonly config: Option.Option<EntrypointConfig>;
	}>;
	readonly lockfile: Lockfile;
}

/**
 * @group Errors
 */
export class RootDirNotFound extends Data.TaggedError("RootDirNotFound")<{
	readonly startDir: Path;
}> {}

/**
 * @group Services
 */
export class WorkspaceService extends ServiceMap.Service<
	WorkspaceService,
	{
		/**
		 * @default startDir PWD процесса
		 */
		readonly discover: (
			startDir?: string,
		) => Effect.Effect<
			Workspace,
			RootDirNotFound | PlatformError.PlatformError
		>;
		/**
		 * @default dir PWD процесса
		 */
		readonly init: (dir?: string) => Effect.Effect<Workspace>;
	}
>()("WorkspaceService") {}

import type * as Effect from "effect/Effect";
import type * as Option from "effect/Option";
import * as ServiceMap from "effect/ServiceMap";

import {
	type InvalidEntrypointConfig,
	type InvalidLockfile,
	type InvalidRootConfig,
	type RootDirAlreadyDefined,
	type RootDirNotFound,
} from "./Errors.js";
import { type Lockfile } from "./Lockfile.js";
import {
	type AbsolutePath,
	type EntrypointConfig,
	type RootConfig,
} from "./Models.js";

/**
 * @group Models
 */
export interface Workspace {
	readonly _tag: "Workspace";
	readonly rootDir: AbsolutePath;
	readonly rootConfig: Option.Option<RootConfig>;
	readonly entrypoints: ReadonlyArray<{
		readonly dir: AbsolutePath;
		readonly config: Option.Option<EntrypointConfig>;
	}>;
	readonly lockfile: Lockfile;
}

/**
 * @group Services
 */
export class WorkspaceService extends ServiceMap.Service<
	WorkspaceService,
	{
		/**
		 * @default startDir process.cwd()
		 */
		readonly discover: (
			startDir?: string,
		) => Effect.Effect<
			Workspace,
			| RootDirNotFound
			| InvalidLockfile
			| InvalidRootConfig
			| InvalidEntrypointConfig
		>;
		/**
		 * @default dir process.cwd()
		 */
		readonly init: (
			dir?: string,
		) => Effect.Effect<Workspace, RootDirAlreadyDefined>;
	}
>()("WorkspaceService") {}

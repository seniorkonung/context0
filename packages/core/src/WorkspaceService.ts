import type * as Effect from "effect/Effect";
import * as ServiceMap from "effect/ServiceMap";

import {
	type InvalidEntrypointConfig,
	type InvalidLockfile,
	type InvalidRootConfig,
	type RootDirAlreadyDefined,
	type RootDirNotFound,
} from "./Errors.js";
import { type AbsolutePath } from "./Models.js";
import { type Workspace } from "./Workspace.js";

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
			startDir?: AbsolutePath,
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
			dir?: AbsolutePath,
		) => Effect.Effect<
			Workspace,
			| RootDirAlreadyDefined
			| RootDirNotFound
			| InvalidLockfile
			| InvalidRootConfig
			| InvalidEntrypointConfig
		>;
	}
>()("WorkspaceService") {}

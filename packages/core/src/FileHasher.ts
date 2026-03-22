import type * as Effect from "effect/Effect";
import * as ServiceMap from "effect/ServiceMap";

import { type LockInfoNotFound } from "./Errors.js";
import { type Hash } from "./Hash.js";
import { type Scope, type WorkspacePath } from "./Models.js";
import { type Workspace } from "./Workspace.js";

/**
 * @group Services
 */
export class FileHasher extends ServiceMap.Service<
	FileHasher,
	{
		readonly hash: (
			workspace: Workspace,
			file: WorkspacePath,
			scope: Scope,
		) => Effect.Effect<Hash, LockInfoNotFound>;
	}
>()("FileHasher") {}

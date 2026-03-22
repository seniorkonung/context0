import type * as Option from "effect/Option";

import { type Lockfile } from "./Lockfile.js";
import {
	type AbsolutePath,
	type EntrypointConfig,
	RelativePath,
	type RootConfig,
} from "./Models.js";
import { withTrailingSlash } from "./Utils.js";

/**
 * @group Models
 */
export interface Workspace {
	readonly _tag: "Workspace";
	readonly rootDir: AbsolutePath;
	readonly cacheDir: AbsolutePath;
	readonly rootConfig: Option.Option<RootConfig>;
	readonly entrypoints: ReadonlyArray<{
		readonly dir: AbsolutePath;
		readonly config: Option.Option<EntrypointConfig>;
	}>;
	readonly lockfile: Lockfile;
}

/**
 * @group Utils
 */
export const relativeDir = (
	workspace: Workspace,
	dir: AbsolutePath,
): RelativePath => {
	return RelativePath.makeUnsafe(
		dir === workspace.rootDir
			? ""
			: dir.slice(withTrailingSlash(workspace.rootDir).length),
	);
};

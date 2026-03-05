import type * as Effect from "effect/Effect";
import type * as HashSet from "effect/HashSet";
import type * as Option from "effect/Option";
import * as ServiceMap from "effect/ServiceMap";

import { type ShellNotFound } from "./Errors.js";
import { type MarkdownAnnotations } from "./MarkdownAnnotations.js";
import {
	type AbsolutePath,
	type CheckStep,
	type ConfigGroup,
	type Tag,
	type WorkspacePath,
} from "./Models.js";

/**
 * @group Namespaces
 */
export namespace CheckRunner {
	/**
	 * @group Params
	 */
	export interface RunCheckParams {
		readonly file: {
			readonly workspacePath: WorkspacePath;
			readonly absolutePath: AbsolutePath;
		};
		readonly attachedTags: HashSet.HashSet<Tag>;
		readonly steps: ReadonlyArray<CheckStep>;
		readonly configGroup: ConfigGroup;
		readonly annotations: Option.Option<MarkdownAnnotations>;
	}
}

/**
 * @group Services
 */
export class CheckRunner extends ServiceMap.Service<
	CheckRunner,
	{
		readonly runCheck: (
			params: CheckRunner.RunCheckParams,
		) => Effect.Effect<boolean, ShellNotFound>;
	}
>()("CheckRunner") {}

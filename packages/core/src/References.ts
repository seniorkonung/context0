import * as HashSet from "effect/HashSet";
import * as Ref from "effect/Ref";
import * as ServiceMap from "effect/ServiceMap";

import { CONTEXT0_DEFAULT_CLI_AGENTS } from "./Constants.js";
import {
	type CliAgent,
	type RelativePath,
	type WorkspacePath,
} from "./Models.js";

/**
 * @group References
 */
export const OperationProgress = ServiceMap.Reference<{
	readonly total: Ref.Ref<number>;
	readonly current: Ref.Ref<number>;
}>("OperationProgress", {
	defaultValue: () => {
		return {
			current: Ref.makeUnsafe(0),
			total: Ref.makeUnsafe(0),
		};
	},
});

/**
 * @group References
 */
export const ActiveReviewFiles = ServiceMap.Reference<
	Ref.Ref<HashSet.HashSet<WorkspacePath | RelativePath>>
>("OperationProgress", {
	defaultValue: () => {
		return Ref.makeUnsafe(HashSet.empty<WorkspacePath | RelativePath>());
	},
});

/**
 * @group References
 */
export const CliAgents = ServiceMap.Reference<ReadonlyArray<CliAgent>>(
	"CliAgents",
	{
		defaultValue: () => {
			return CONTEXT0_DEFAULT_CLI_AGENTS;
		},
	},
);

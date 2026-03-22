import type * as Effect from "effect/Effect";
import * as ServiceMap from "effect/ServiceMap";

import { type CliAgentCrash, type CliAgentNotFound } from "./Errors.js";

/**
 * @group Params
 */
export interface QueryParams {
	readonly prompt: string;
	readonly cwd: string;
}

/**
 * @group Services
 */
export class CliAgentClient extends ServiceMap.Service<
	CliAgentClient,
	{
		readonly query: (
			params: QueryParams,
		) => Effect.Effect<string, CliAgentNotFound | CliAgentCrash>;
	}
>()("CliAgentClient") {}

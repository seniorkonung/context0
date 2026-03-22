import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import { flow } from "effect/Function";
import * as Layer from "effect/Layer";
import * as Match from "effect/Match";
import * as Stream from "effect/Stream";
import * as ChildProcess from "effect/unstable/process/ChildProcess";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";

import { CliAgentClient, type QueryParams } from "./CliAgentClient.js";
import { CliAgentCrash, CliAgentNotFound } from "./Errors.js";
import { CliAgents } from "./References.js";

/**
 * @group Layers
 */
export const layer = Layer.effect(
	CliAgentClient,
	Effect.gen(function* () {
		const processSpawner = yield* ChildProcessSpawner.ChildProcessSpawner;

		const query = Effect.fn("query")(function* (params: QueryParams) {
			const cliAgents = yield* CliAgents;

			for (const cliAgent of cliAgents) {
				const command = Match.value({ cliAgent }).pipe(
					Match.discriminators("cliAgent")({
						claude: () => ({ cmd: "claude", args: ["-p"] }),
					}),
					Match.exhaustive,
				);

				const handle = yield* ChildProcess.make(command.cmd, command.args, {
					extendEnv: true,
					detached: false,
					cwd: params.cwd,
					stdin: Stream.fromEffect(
						Effect.succeed(new TextEncoder().encode(params.prompt)),
					),
				}).pipe(processSpawner.spawn, Effect.result);

				if (handle._tag === "Failure") {
					const error = handle.failure;
					if ("_tag" in error.reason && error.reason._tag === "NotFound") {
						continue;
					}
					return yield* error;
				}

				const stdout = yield* handle.success.stdout.pipe(
					Stream.map((output) => new TextDecoder().decode(output)),
					Stream.runCollect,
					Effect.map(Array.join("")),
				);
				const stderr = yield* handle.success.stderr.pipe(
					Stream.map((output) => new TextDecoder().decode(output)),
					Stream.runCollect,
					Effect.map(Array.join("")),
				);

				const exitCode = yield* handle.success.exitCode;
				if (exitCode === 0) return stdout;
				return yield* new CliAgentCrash({ stderr, exitCode });
			}

			return yield* new CliAgentNotFound({
				cliAgents,
			});
		}, Effect.scoped);

		return {
			query: flow(
				query,
				Effect.catchTags({
					PlatformError: Effect.die,
				}),
			),
		};
	}),
);

/**
 * @group Layers
 */
export const live = layer;

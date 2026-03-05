import * as Array from "effect/Array";
import * as Boolean from "effect/Boolean";
import * as Effect from "effect/Effect";
import * as Equal from "effect/Equal";
import { flow, pipe } from "effect/Function";
import * as HashSet from "effect/HashSet";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import type * as PlatformError from "effect/PlatformError";
import * as Record from "effect/Record";
import * as Schema from "effect/Schema";
import * as SchemaParser from "effect/SchemaParser";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import * as Terminal from "effect/Terminal";
import * as ChildProcess from "effect/unstable/process/ChildProcess";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";
import picomatch from "picomatch";

import { CheckRunner } from "./CheckRunner.js";
import { ShellNotFound } from "./Errors.js";
import {
	type AbsolutePath,
	type Command,
	type Tag,
	type WorkspacePath,
} from "./Models.js";

/**
 * @group Layers
 */
const layer = Layer.effect(
	CheckRunner,
	Effect.gen(function* () {
		const path = yield* Path.Path;
		const processSpawner = yield* ChildProcessSpawner.ChildProcessSpawner;
		const terminal = yield* Terminal.Terminal;

		const stdout = Sink.forEach((buffer: Uint8Array) => {
			return terminal.display(new TextDecoder().decode(buffer));
		});

		const glob = (pattern: string, file: WorkspacePath): boolean => {
			const isMatch = picomatch(pattern, { dot: true });
			return isMatch(file);
		};

		const tags = (
			tags: ReadonlyArray<Tag>,
			attachedTags: HashSet.HashSet<Tag>,
		): boolean => {
			return pipe(
				tags,
				Array.map((tag) => HashSet.has(attachedTags, tag)),
				Boolean.ReducerAnd.combineAll,
			);
		};

		const cmd = Effect.fnUntraced(
			function* (params: {
				readonly rootDir: AbsolutePath;
				readonly configDir: AbsolutePath;
				readonly targetFile: AbsolutePath;
				readonly command: Command;
			}) {
				const { command, configDir, targetFile, rootDir } = params;
				const {
					run,
					workdir,
					env,
					with: data,
					debug,
				} = typeof command === "object"
					? {
							run: command.run,
							workdir: path.resolve(configDir, command.workdir ?? configDir),
							env: command.env ?? {},
							with: command.with ?? null,
							debug: command.debug ?? "none",
						}
					: {
							run: command,
							workdir: configDir,
							env: {},
							with: null,
							debug: "none" as const,
						};

				const handle = yield* ChildProcess.make({
					extendEnv: true,
					detached: false,
					env: Record.union(
						env,
						{
							CONTEXT0_TARGET_FILE: targetFile,
							CONTEXT0_ENTRYPOINT_DIR: configDir,
							CONTEXT0_ROOT_DIR: rootDir,
							CONTEXT0_WITH: SchemaParser.encodeSync(
								Schema.UnknownFromJsonString,
							)(data),
						},
						(_, b) => b,
					),
					cwd: workdir,
				})`sh`.pipe(
					processSpawner.spawn,
					Effect.catch(
						(
							error,
						): Effect.Effect<
							never,
							PlatformError.PlatformError | ShellNotFound
						> => {
							if ("kind" in error.reason && error.reason.kind === "NotFound") {
								return new ShellNotFound().asEffect();
							}
							return Effect.fail(error);
						},
					),
				);

				yield* Stream.fromEffect(Effect.succeed(run)).pipe(
					Stream.map((cmd) => new TextEncoder().encode(cmd)),
					Stream.run(handle.stdin),
				);

				yield* handle.all.pipe(
					Stream.run(stdout),
					Effect.when(Effect.succeed(debug === "all")),
				);

				yield* handle.stdout.pipe(
					Stream.run(stdout),
					Effect.when(Effect.succeed(debug === "stdout")),
				);

				yield* handle.stderr.pipe(
					Stream.run(stdout),
					Effect.when(Effect.succeed(debug === "stderr")),
				);

				const exitCode = yield* handle.exitCode;
				return exitCode === 0;
			},
			Effect.scoped,
			Effect.catchTags({
				PlatformError: Effect.die,
			}),
		);

		const executeChecks = (
			params: CheckRunner.RunCheckParams,
		): Stream.Stream<boolean, ShellNotFound> => {
			return Stream.fromIterable(params.steps).pipe(
				Stream.mapEffect(
					Effect.fnUntraced(function* (step) {
						if ("glob" in step)
							return glob(step.glob, params.file.workspacePath);
						if ("tags" in step) return tags(step.tags, params.attachedTags);

						if ("cmd" in step) {
							return yield* cmd({
								command: step.cmd,
								targetFile: params.file.absolutePath,
								configDir: params.configGroup.dir,
								rootDir: params.configGroup.rootDir,
							});
						}

						if ("not" in step)
							return yield* not({ ...params, steps: [step.not] });
						if ("allOf" in step)
							return yield* allOf({ ...params, steps: step.allOf });
						if ("anyOf" in step)
							return yield* anyOf({ ...params, steps: step.anyOf });
						if ("noneOf" in step)
							return yield* noneOf({ ...params, steps: step.noneOf });
						if ("oneOf" in step)
							return yield* oneOf({ ...params, steps: step.oneOf });

						if ("if" in step) {
							if (yield* allOf({ ...params, steps: [step.if] })) {
								return yield* allOf({ ...params, steps: [step.then] });
							} else if (step.else) {
								return yield* allOf({ ...params, steps: [step.else] });
							}
							return false;
						}

						return false;
					}),
				),
			);
		};

		const not = (params: CheckRunner.RunCheckParams) =>
			allOf(params).pipe(Effect.map(Boolean.not));

		const allOf = (params: CheckRunner.RunCheckParams) =>
			executeChecks(params).pipe(
				Stream.run(
					Sink.fold(
						() => true,
						Equal.equals(true),
						flow(Boolean.and, Effect.succeed),
					),
				),
			);

		const anyOf = (params: CheckRunner.RunCheckParams) =>
			executeChecks(params).pipe(
				Stream.run(
					Sink.fold(
						() => false,
						Equal.equals(false),
						flow(Boolean.or, Effect.succeed),
					),
				),
			);

		const noneOf = (params: CheckRunner.RunCheckParams) =>
			executeChecks(params).pipe(
				Stream.run(
					Sink.fold(
						() => false,
						Equal.equals(true),
						flow(Boolean.nor, Effect.succeed),
					),
				),
			);

		const oneOf = (params: CheckRunner.RunCheckParams) =>
			executeChecks(params).pipe(
				Stream.run(
					Sink.fold(
						(): 0 | 1 | 2 => 0,
						(state) => state < 2,
						(state, flag) => {
							if (!flag) return Effect.succeed(state);
							if (state === 0) return Effect.succeed(1 as const);
							return Effect.succeed(2 as const);
						},
					),
				),
				Effect.map(Equal.equals(1)),
			);

		return {
			runCheck: Effect.fn("runCheck")(function* (params) {
				return yield* allOf(params);
			}),
		};
	}),
);

/**
 * @group Layers
 */
export const live = layer;

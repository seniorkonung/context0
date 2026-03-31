import * as Context0 from "@context0/core/Context0";
import * as Models from "@context0/core/Models";
import * as References from "@context0/core/References";
import * as WorkspaceService from "@context0/core/WorkspaceService";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";
import * as Schedule from "effect/Schedule";
import * as String from "effect/String";
import * as Argument from "effect/unstable/cli/Argument";
import * as Command from "effect/unstable/cli/Command";
import * as Flag from "effect/unstable/cli/Flag";

import { QueryArgument } from "./Arguments.js";
import { IS_INTERACTIVE_TERMINAL, SPINNER_FRAMES } from "./Constants.js";
import {
	DirFlag,
	FileFlag,
	JsonFlag,
	NoProgressFlag,
	ProgressFlag,
} from "./Flags.js";
import * as Formatter from "./Formatter.js";
import { LogUpdate } from "./LogUpdate.js";

/**
 * @group Commands
 */
export const InitCommand = Command.make(
	"init",
	{
		dir: DirFlag,
	},
	Effect.fn("InitCommand")(function* ({ dir }) {
		const workspaceService = yield* WorkspaceService.WorkspaceService;
		yield* workspaceService.init(dir);
	}),
);

/**
 * @group Commands
 */
export const SyncCommand = Command.make(
	"sync",
	{
		noProgress: NoProgressFlag,
		progress: ProgressFlag,
		quiet: Flag.boolean("quiet"),
		dir: DirFlag,
		file: FileFlag,
		tags: Flag.string("tag").pipe(
			Flag.withAlias("t"),
			Flag.withSchema(Models.Tag),
			Flag.atLeast(0),
		),
	},
	Effect.fn("SyncCommand")(function* ({
		progress,
		noProgress,
		dir,
		tags,
		quiet,
	}) {
		const context0 = yield* Context0.Context0;
		const operationProgress = yield* References.OperationProgress;
		const logUpdate = yield* LogUpdate;

		const showProgress =
			!quiet && (progress || (!noProgress && IS_INTERACTIVE_TERMINAL));
		const isSyncingRef = yield* Ref.make(true);
		const startTime = yield* DateTime.now;

		yield* Effect.all(
			[
				context0
					.sync({
						dir,
						tags: tags,
					})
					.pipe(Effect.onExit(() => Ref.set(isSyncingRef, false))),
				Effect.gen(function* () {
					const icon =
						SPINNER_FRAMES[
							Math.floor(Date.now() / 100) % SPINNER_FRAMES.length
						];
					const current = yield* Ref.get(operationProgress.current).pipe(
						Effect.map(String.String),
					);
					const total = yield* Ref.get(operationProgress.total).pipe(
						Effect.map(String.String),
					);
					yield* logUpdate.update(
						Formatter.syncProgress({
							icon,
							current,
							total,
						}),
					);
				}).pipe(
					Effect.repeat(
						Schedule.forever.pipe(
							Schedule.addDelay(() => Effect.succeed("100 millis")),
							Schedule.while(() => Ref.get(isSyncingRef)),
						),
					),
					Effect.when(Effect.succeed(showProgress)),
				),
			],
			{ concurrency: "unbounded", discard: true },
		).pipe(
			Effect.onExit(
				Effect.fnUntraced(function* (exit) {
					const current = yield* Ref.get(operationProgress.current).pipe(
						Effect.map(String.String),
					);

					if (showProgress) {
						if (exit._tag === "Failure") {
							return yield* logUpdate.clear();
						} else {
							return yield* logUpdate.persist(
								Formatter.syncSuccess({
									current,
									duration: DateTime.distance(startTime, yield* DateTime.now),
								}),
							);
						}
					}

					if (!quiet && exit._tag === "Success") {
						return yield* logUpdate.persist(
							Formatter.syncSuccess({
								current,
								duration: DateTime.distance(startTime, yield* DateTime.now),
							}),
						);
					}
				}),
			),
		);
	}, Effect.scoped),
);

/**
 * @group Commands
 */
export const SearchCommand = Command.make(
	"search",
	{
		query: QueryArgument,
		json: JsonFlag,
		dir: DirFlag,
	},
	Effect.fn("SearchCommand")(function* ({ query, json, dir }) {
		const logUpdate = yield* LogUpdate;
		const context0 = yield* Context0.Context0;
		const files = yield* context0.search(query, {
			dir,
		});

		if (json) {
			yield* logUpdate.persist(Formatter.json(files));
			return;
		}

		yield* logUpdate.persist(Formatter.search(files));
	}),
);

/**
 * @group Commands
 */
export const DescribeCommand = Command.make(
	"describe",
	{
		file: Argument.file("file", { mustExist: true }),
		json: JsonFlag,
	},
	Effect.fn("DescribeCommand")(function* ({ json, file }) {
		const logUpdate = yield* LogUpdate;
		const context0 = yield* Context0.Context0;
		const result = yield* context0.describe(
			Models.AbsolutePath.makeUnsafe(file),
		);

		if (json) {
			yield* logUpdate.persist(Formatter.json(result));
			return;
		}

		yield* logUpdate.persist(
			Formatter.describe({
				tags: result.tags.map(
					({ name, description }) => [name, description] as [string, string],
				),
				context: result.context.map(
					({ path, description }) => [path, description] as [string, string],
				),
			}),
		);
	}),
);

/**
 * @group Commands
 */
export const Context0Command = Command.make("context0").pipe(
	Command.withSubcommands([
		InitCommand,
		SyncCommand,
		SearchCommand,
		DescribeCommand,
	]),
);

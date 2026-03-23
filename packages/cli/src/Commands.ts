import * as Context0 from "@context0/core/Context0";
import * as Models from "@context0/core/Models";
import * as References from "@context0/core/References";
import * as WorkspaceService from "@context0/core/WorkspaceService";
import ansi from "ansi-escapes";
import chalk from "chalk";
import * as Array from "effect/Array";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import { pipe } from "effect/Function";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";
import * as String from "effect/String";
import * as Terminal from "effect/Terminal";
import * as Argument from "effect/unstable/cli/Argument";
import * as Command from "effect/unstable/cli/Command";
import * as Flag from "effect/unstable/cli/Flag";

import { QueryArgument } from "./Arguments.js";
import * as CliUi from "./CliUi.js";
import { IS_INTERACTIVE_TERMINAL, SPINNER_FRAMES } from "./Constants.js";
import { DirFlag, JsonFlag } from "./Flags.js";

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
		noProgress: Flag.boolean("no-progress"),
		progress: Flag.boolean("progress"),
		quiet: Flag.boolean("quiet"),
		dir: DirFlag,
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
		const terminal = yield* Terminal.Terminal;
		const context0 = yield* Context0.Context0;
		const operationProgress = yield* References.OperationProgress;

		const showProgress =
			!quiet && (progress || (!noProgress && IS_INTERACTIVE_TERMINAL));
		yield* Effect.acquireRelease(terminal.display(ansi.cursorHide), () =>
			terminal.display(ansi.cursorShow).pipe(Effect.orDie),
		).pipe(Effect.when(Effect.succeed(showProgress)));

		const isSyncingRef = yield* Ref.make(true);
		const startTime = yield* DateTime.now;

		const prettyIcon = (str: string) => chalk.yellow(str);
		const prettyCurrent = (n: number) => chalk.bold.white(n);
		const prettyDelimiter = () => chalk.gray("/");
		const prettyTotal = (n: number) => chalk.dim(n);

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
					const current = yield* Ref.get(operationProgress.current);
					const total = yield* Ref.get(operationProgress.total);
					yield* pipe(
						ansi.eraseLine,
						String.concat(ansi.cursorLeft),
						String.concat(
							`${prettyIcon(icon)} ${prettyCurrent(current)}${prettyDelimiter()}${prettyTotal(total)}`,
						),
						terminal.display,
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
					const current = yield* Ref.get(operationProgress.current);
					const time = DateTime.distance(startTime, yield* DateTime.now).pipe(
						Duration.toSeconds,
						(duration) => duration.toFixed(1),
					);

					if (showProgress) {
						if (exit._tag === "Failure") {
							return yield* pipe(
								ansi.eraseLine,
								String.concat(ansi.cursorLeft),
								terminal.display,
							);
						} else {
							return yield* pipe(
								ansi.eraseLine,
								String.concat(ansi.cursorLeft),
								String.concat(
									`${prettyIcon("✔")} Successfully synced ${prettyCurrent(current)} files (${time}s)\n`,
								),
								terminal.display,
							);
						}
					}

					if (!quiet && exit._tag === "Success") {
						yield* terminal.display(
							`${prettyIcon("✔")} Successfully synced ${prettyCurrent(current)} files (${time}s)\n`,
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
		const terminal = yield* Terminal.Terminal;
		const context0 = yield* Context0.Context0;
		const files = yield* context0.search(query, {
			dir,
		});

		if (json) {
			yield* terminal.display(JSON.stringify(files, null, " "));
			yield* terminal.display("\n");
			return;
		}

		const prettyElement = (str: string): string => chalk.green(str);

		yield* terminal.display(files.map(prettyElement).join("\n"));
		yield* terminal.display("\n");
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
		const terminal = yield* Terminal.Terminal;
		const context0 = yield* Context0.Context0;
		const result = yield* context0.describe(
			Models.AbsolutePath.makeUnsafe(file),
		);

		if (json) {
			yield* terminal.display(JSON.stringify(result, null, " "));
			yield* terminal.display("\n");
			return;
		}

		const prettyTitle = (str: string): string => chalk.bold.white(str);
		const prettyDescription = (str: string): string =>
			chalk.white(str).replaceAll("\n", "\n\t      ");
		const prettyElement = (str: string): string => chalk.green(str);

		const tagsOutput = pipe(
			"",
			String.concat(prettyTitle("TAGS\n")),
			String.concat(
				pipe(
					result.tags,
					Array.map(
						({ name, description }) =>
							`  ${prettyElement(name)}\t      ${prettyDescription(description)}`,
					),
					Array.join("\n"),
				),
			),
			CliUi.div,
		);

		const contextOutput = pipe(
			"",
			String.concat(prettyTitle("CONTEXT\n")),
			String.concat(
				pipe(
					result.context,
					Array.map(
						({ path, description }) =>
							`  ${prettyElement(path)}\t      ${prettyDescription(description)}`,
					),
					Array.join("\n"),
				),
			),
			CliUi.div,
		);

		yield* terminal.display(tagsOutput);
		yield* terminal.display("\n\n");
		yield* terminal.display(contextOutput);
		yield* terminal.display("\n");
	}),
);

/**
 * @group Commands
 */
export const ReviewCommand = Command.make(
	"review",
	{
		plan: Flag.boolean("plan"),
		agent: Flag.string("agent").pipe(
			Flag.withSchema(Models.CliAgent),
			Flag.optional,
			Flag.map(Option.getOrUndefined),
		),
		parallel: Flag.string("parallel").pipe(
			Flag.withSchema(Schema.NumberFromString),
			Flag.optional,
			Flag.map(Option.getOrUndefined),
		),
		refresh: Flag.boolean("refresh"),
		dir: DirFlag,
		query: QueryArgument.pipe(
			Argument.optional,
			Argument.map(Option.getOrUndefined),
		),
	},
	Effect.fn("ReviewCommand")(function* ({
		plan,
		refresh,
		dir,
		query,
		parallel,
		agent,
	}) {
		const context0 = yield* Context0.Context0;
		if (plan) {
			yield* context0
				.plan({
					dir,
					query,
					refresh,
				})
				.pipe(Effect.tap(Effect.log));
		} else {
			const h = yield* context0
				.review({
					parallel,
					cliAgent: agent,
					dir,
					query,
					refresh,
				})
				.pipe(Effect.tap(Effect.log));
			console.dir(h, { depth: null });
		}
	}),
);

/**
 * @group Commands
 */
export const Context0Command = Command.make("context0").pipe(
	Command.withSubcommands([
		ReviewCommand,
		InitCommand,
		SyncCommand,
		SearchCommand,
		DescribeCommand,
	]),
);

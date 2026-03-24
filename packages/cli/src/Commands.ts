import * as Context0 from "@context0/core/Context0";
import type * as Feedback from "@context0/core/Feedback";
import * as Models from "@context0/core/Models";
import * as References from "@context0/core/References";
import * as WorkspaceService from "@context0/core/WorkspaceService";
import ansi from "ansi-escapes";
import chalk from "chalk";
import { Record } from "effect";
import * as Array from "effect/Array";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import { pipe } from "effect/Function";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as String from "effect/String";
import * as Terminal from "effect/Terminal";
import * as Argument from "effect/unstable/cli/Argument";
import * as Command from "effect/unstable/cli/Command";
import * as Flag from "effect/unstable/cli/Flag";

import { QueryArgument } from "./Arguments.js";
import * as CliUi from "./CliUi.js";
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
					const delimiter = Formatter.secondary("/");
					yield* pipe(
						ansi.eraseLine,
						String.concat(ansi.cursorLeft),
						String.concat(
							`${Formatter.icon(icon)} ${Formatter.title(current)}${delimiter}${Formatter.secondary(total)}`,
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
					const current = yield* Ref.get(operationProgress.current).pipe(
						Effect.map(String.String),
					);
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
									`${Formatter.icon("✔")} Successfully synced ${Formatter.title(current)} files (${time}s)\n`,
								),
								terminal.display,
							);
						}
					}

					if (!quiet && exit._tag === "Success") {
						yield* terminal.display(
							`${Formatter.icon("✔")} Successfully synced ${Formatter.title(current)} files (${time}s)\n`,
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

		yield* terminal.display(Formatter.table1(files));
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

		const tagsOutput = pipe(
			"",
			String.concat(Formatter.title("TAGS\n")),
			String.concat(
				pipe(
					result.tags,
					Array.map(({ name, description }) => [name, description] as const),
					Formatter.table2,
				),
			),
			CliUi.div,
		);

		const contextOutput = pipe(
			"",
			String.concat(Formatter.title("CONTEXT\n")),
			String.concat(
				pipe(
					result.context,
					Array.map(({ path, description }) => [path, description] as const),
					Formatter.table2,
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

const _matchFeedbackLevel = <T>(
	feedback: ReadonlyArray<{
		level:
			| Feedback.FeedbackItem["level"]
			| (Feedback.FeedbackLevel | "unknown");
	}>,
	fields: {
		readonly red: () => T;
		readonly yellow: () => T;
		readonly green: () => T;
		readonly unknown: () => T;
	},
): T => {
	const containsRedLevel = feedback.some(({ level }) =>
		Option.isOption(level)
			? Option.getOrUndefined(level) === "red"
			: level === "red",
	);
	if (containsRedLevel) return fields.red();

	const containsYellowLevel = feedback.some(({ level }) =>
		Option.isOption(level)
			? Option.getOrUndefined(level) === "yellow"
			: level === "yellow",
	);
	if (containsYellowLevel) return fields.yellow();

	const containsGreenLevel = feedback.some(({ level }) =>
		Option.isOption(level)
			? Option.getOrUndefined(level) === "green"
			: level === "green",
	);
	if (containsGreenLevel) return fields.green();

	return fields.unknown();
};

/**
 * @group Commands
 */
export const ReviewCommand = Command.make(
	"review",
	{
		json: JsonFlag,
		noProgress: NoProgressFlag,
		progress: ProgressFlag,
		short: Flag.boolean("short"),
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
		file: FileFlag,
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
		json,
		file,
		progress,
		noProgress,
		short,
	}) {
		const pathService = yield* Path.Path;
		const terminal = yield* Terminal.Terminal;
		const context0 = yield* Context0.Context0;

		if (plan) {
			const plan = yield* context0.plan({
				dir,
				query,
				refresh,
				file,
			});

			if (json) {
				yield* terminal.display(JSON.stringify(plan, null, " "));
				yield* terminal.display("\n");
				return;
			}

			const pendingOutput = pipe(
				"",
				String.concat(
					pipe(
						plan.pending,
						Array.map(
							({ contextFiles, path }) =>
								[
									`○ ${path}`,
									contextFiles
										.map((file) => pathService.basename(file))
										.join(","),
								] as const,
						),
						Formatter.table2,
					),
				),
				CliUi.div,
			);

			const reviewedWithoutFeedbackOutput = pipe(
				"",
				String.concat(
					pipe(
						plan.reviewedWithoutFeedback,
						Array.map(
							({ contextFiles, path }) =>
								[
									`✓ ${path}`,
									contextFiles
										.map((file) => pathService.basename(file))
										.join(","),
								] as const,
						),
						Formatter.table2,
					),
				),
				CliUi.div,
			);

			const reviewedWithFeedbackOutput = pipe(
				"",
				String.concat(
					pipe(
						plan.reviewedWithFeedback,
						Array.map(
							({ contextFiles, path }) =>
								[
									`● ${path}`,
									contextFiles
										.map((file) => pathService.basename(file))
										.join(","),
								] as const,
						),
						Formatter.table2,
					),
				),
				CliUi.div,
			);

			if (pendingOutput.length) {
				yield* terminal.display(pendingOutput);
				yield* terminal.display("\n");
			}
			if (reviewedWithoutFeedbackOutput.length) {
				yield* terminal.display(reviewedWithoutFeedbackOutput);
				yield* terminal.display("\n");
			}
			if (reviewedWithFeedbackOutput.length) {
				yield* terminal.display(reviewedWithFeedbackOutput);
				yield* terminal.display("\n");
			}
			return;
		}

		const operationProgress = yield* References.OperationProgress;
		const activeReviewFiles = yield* References.ActiveReviewFiles;
		const logUpdate = yield* LogUpdate;

		const showProgress = progress || (!noProgress && IS_INTERACTIVE_TERMINAL);
		yield* Effect.acquireRelease(terminal.display(ansi.cursorHide), () =>
			terminal.display(ansi.cursorShow).pipe(Effect.orDie),
		).pipe(Effect.when(Effect.succeed(showProgress)));

		const isReviewingRef = yield* Ref.make(true);
		const counters = {
			passed: yield* Ref.make(0),
			warnings: yield* Ref.make(0),
			errors: yield* Ref.make(0),
			unknowns: yield* Ref.make(0),
		};
		const startTime = yield* DateTime.now;

		const reviewStream = yield* context0.review({
			parallel,
			cliAgent: agent,
			dir,
			query,
			refresh,
			file,
		});

		yield* Effect.all(
			[
				pipe(
					reviewStream,
					Stream.tap(({ feedback }) =>
						_matchFeedbackLevel(feedback, {
							unknown: () => Ref.update(counters.unknowns, (n) => n + 1),
							red: () => Ref.update(counters.errors, (n) => n + 1),
							yellow: () => Ref.update(counters.warnings, (n) => n + 1),
							green: () => Ref.update(counters.passed, (n) => n + 1),
						}),
					),
					Stream.tap(
						Effect.fnUntraced(function* ({ path, feedback }) {
							const feedbackByContextFile = pipe(
								feedback,
								Array.map(({ contextFile, level, summary, text }) => {
									return {
										contextFile: Option.getOrElse(
											contextFile,
											() => "<unknown>",
										),
										level: Option.getOrElse(level, () => "unknown" as const),
										summary: Option.getOrElse(summary, () => "<unknown>"),
										text,
									};
								}),
								Array.groupBy(({ contextFile }) => contextFile),
								Record.map(
									Array.map(({ level, summary, text }, i) => {
										const isLastItem = feedback.length - 1 === i;
										const branch = isLastItem ? "└──" : "├──";
										const prettySummary = chalk.redBright(summary);
										const summaryOutput = Match.value({ level }).pipe(
											Match.discriminators("level")({
												unknown: () =>
													Formatter.warning(`    ${branch} ? ${prettySummary}`),
												red: () =>
													Formatter.error(`    ${branch} ✗ ${prettySummary}`),
												green: () =>
													Formatter.warning(`    ${branch} ⚠ ${prettySummary}`),
												yellow: () =>
													Formatter.element(`    ${branch} ✔ ${prettySummary}`),
											}),
											Match.exhaustive,
										);

										if (short) {
											return { level, output: summaryOutput };
										}

										const textOutput = pipe(
											"        ",
											String.concat(text),
											String.replaceAll("\n", "\n        "),
											CliUi.div,
										);
										return { level, output: `${summaryOutput}\n${textOutput}` };
									}),
								),
							);

							const feedbackOutput = pipe(
								Record.toEntries(feedbackByContextFile),
								Array.map(([contextFile, feedback], i) => {
									const isLastItem = feedback.length - 1 === i;
									const branch = isLastItem ? "└──" : "├──";
									const prettyContextFile = chalk.cyan(contextFile);
									return pipe(
										_matchFeedbackLevel(feedback, {
											unknown: () =>
												Formatter.warning(`${branch} ? ${prettyContextFile}`),
											red: () =>
												Formatter.error(`${branch} ✗ ${prettyContextFile}`),
											yellow: () =>
												Formatter.warning(`${branch} ⚠ ${prettyContextFile}`),
											green: () =>
												Formatter.element(`${branch} ✔ ${prettyContextFile}`),
										}),
										String.concat("\n"),
										String.concat(
											feedback.map(({ output }) => output).join("\n"),
										),
									);
								}),
								Array.join("\n"),
							);

							yield* logUpdate.persist(
								_matchFeedbackLevel(feedback, {
									red: () => Formatter.error(`✗ ${path}`),
									yellow: () => Formatter.warning(`⚠ ${path}`),
									green: () => Formatter.element(`✔ ${path}`),
									unknown: () => Formatter.warning(`? ${path}`),
								}),
							);

							if (feedbackOutput) {
								yield* logUpdate.persist(`${feedbackOutput}`);
							}
						}),
					),
					Stream.runDrain,
					Effect.onExit(() => Ref.set(isReviewingRef, false)),
				),
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
					const reviewFiles = yield* Ref.get(activeReviewFiles).pipe(
						Effect.map(Array.fromIterable),
					);
					const time = Formatter.duration(
						DateTime.distance(startTime, yield* DateTime.now),
					);
					const delimiter = Formatter.secondary("/");
					yield* logUpdate.update(
						pipe(
							"\n",
							String.concat(
								pipe(
									reviewFiles,
									Array.map((file) =>
										pipe(
											"",
											String.concat(
												`${Formatter.icon(icon)} ${chalk.dim(file)}`,
											),
											CliUi.div,
										),
									),
									Array.join("\n"),
								),
							),
							String.concat("\n\n"),
							String.concat(
								pipe(
									"",
									String.concat(
										`${Formatter.icon(icon)} ${Formatter.text(current)}${delimiter}${Formatter.secondary(total)} (${time})`,
									),
									String.concat(
										`\n${Formatter.element(`✔ ${yield* Ref.get(counters.passed)} passed`)}`,
									),
									String.concat(
										` ${Formatter.error(`✗ ${yield* Ref.get(counters.errors)} errors`)}`,
									),
									String.concat(
										` ${Formatter.warning(`⚠ ${yield* Ref.get(counters.warnings)} warnings`)}`,
									),
									String.concat(
										(yield* Ref.get(counters.unknowns)) > 0
											? ` ${Formatter.warning(`(${yield* Ref.get(counters.unknowns)} unknowns)`)}`
											: "",
									),
								),
							),
						),
					);
				}).pipe(
					Effect.repeat(
						Schedule.forever.pipe(
							Schedule.addDelay(() => Effect.succeed("100 millis")),
							Schedule.while(() => Ref.get(isReviewingRef)),
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
					const time = Formatter.duration(
						DateTime.distance(startTime, yield* DateTime.now),
					);

					if (showProgress) {
						yield* logUpdate.clear();
					}

					if (exit._tag === "Success") {
						yield* pipe(
							"",
							String.concat(
								pipe(
									"",
									String.concat(
										Formatter.title(
											`\n${Formatter.title(current)} files (${time}) `,
										),
									),
									String.concat(
										`${Formatter.element(`✔ ${yield* Ref.get(counters.passed)} passed`)}`,
									),
									String.concat(
										` ${Formatter.error(`✗ ${yield* Ref.get(counters.errors)} errors`)}`,
									),
									String.concat(
										` ${Formatter.warning(`⚠ ${yield* Ref.get(counters.warnings)} warnings`)}`,
									),
									String.concat(
										(yield* Ref.get(counters.unknowns)) > 0
											? ` ${Formatter.warning(`(${yield* Ref.get(counters.unknowns)} unknowns)`)}`
											: "",
									),
								),
							),
							logUpdate.persist,
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
export const Context0Command = Command.make("context0").pipe(
	Command.withSubcommands([
		ReviewCommand,
		InitCommand,
		SyncCommand,
		SearchCommand,
		DescribeCommand,
	]),
);

import * as Context0 from "@context0/core/Context0";
import type * as Feedback from "@context0/core/Feedback";
import * as Models from "@context0/core/Models";
import * as References from "@context0/core/References";
import * as WorkspaceService from "@context0/core/WorkspaceService";
import * as Array from "effect/Array";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import { pipe } from "effect/Function";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
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
					const time = DateTime.distance(startTime, yield* DateTime.now).pipe(
						Duration.toSeconds,
						(duration) => duration.toFixed(1),
					);

					if (showProgress) {
						if (exit._tag === "Failure") {
							return yield* logUpdate.clear();
						} else {
							return yield* logUpdate.persist(
								Formatter.syncSuccess({
									current,
									time,
								}),
							);
						}
					}

					if (!quiet && exit._tag === "Success") {
						return yield* logUpdate.persist(
							Formatter.syncSuccess({ current, time }),
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
		const logUpdate = yield* LogUpdate;
		const pathService = yield* Path.Path;
		const context0 = yield* Context0.Context0;

		if (plan) {
			const plan = yield* context0.plan({
				dir,
				query,
				refresh,
				file,
			});

			if (json) {
				yield* logUpdate.persist(Formatter.json(plan));
				return;
			}

			const planOutput = Formatter.reviewPlan({
				pending: plan.pending.map(({ contextFiles, path }) => ({
					path,
					contextFiles: contextFiles.map((file) => pathService.basename(file)),
				})),
				reviewedWithoutFeedback: plan.reviewedWithoutFeedback.map(
					({ contextFiles, path }) => ({
						path,
						contextFiles: contextFiles.map((file) =>
							pathService.basename(file),
						),
					}),
				),
				reviewedWithFeedback: plan.reviewedWithFeedback.map(
					({ contextFiles, path }) => ({
						path,
						contextFiles: contextFiles.map((file) =>
							pathService.basename(file),
						),
					}),
				),
			});

			if (planOutput.length) {
				yield* logUpdate.persist(planOutput);
			}
			return;
		}

		const operationProgress = yield* References.OperationProgress;
		const activeReviewFiles = yield* References.ActiveReviewFiles;

		const showProgress = progress || (!noProgress && IS_INTERACTIVE_TERMINAL);

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
							const normalizedFeedback = feedback.map(
								({ contextFile, level, summary, text }) => ({
									contextFile: Option.getOrElse(contextFile, () => "<unknown>"),
									level: Option.getOrElse(level, () => "unknown" as const),
									summary: Option.getOrElse(summary, () => "<unknown>"),
									text,
								}),
							);

							const lineLevel = _matchFeedbackLevel(normalizedFeedback, {
								red: () => "red" as const,
								yellow: () => "yellow" as const,
								green: () => "green" as const,
								unknown: () => "unknown" as const,
							});

							yield* logUpdate.persist(
								Formatter.reviewPathLine({ path, level: lineLevel }),
							);

							const feedbackOutput = Formatter.reviewFeedbackDetails({
								feedback: normalizedFeedback,
								short,
							});

							if (feedbackOutput) {
								yield* logUpdate.persist(feedbackOutput);
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
					yield* logUpdate.update(
						Formatter.reviewProgress({
							icon,
							current,
							total,
							time,
							reviewFiles,
							passed: yield* Ref.get(counters.passed),
							errors: yield* Ref.get(counters.errors),
							warnings: yield* Ref.get(counters.warnings),
							unknowns: yield* Ref.get(counters.unknowns),
						}),
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
						yield* logUpdate.persist(
							Formatter.reviewFinalSummary({
								current,
								time,
								passed: yield* Ref.get(counters.passed),
								errors: yield* Ref.get(counters.errors),
								warnings: yield* Ref.get(counters.warnings),
								unknowns: yield* Ref.get(counters.unknowns),
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
export const Context0Command = Command.make("context0").pipe(
	Command.withSubcommands([
		ReviewCommand,
		InitCommand,
		SyncCommand,
		SearchCommand,
		DescribeCommand,
	]),
);

import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import { identity, pipe } from "effect/Function";
import * as HashSet from "effect/HashSet";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Record from "effect/Record";
import * as Ref from "effect/Ref";
import * as Result from "effect/Result";
import * as SchemaParser from "effect/SchemaParser";
import * as Stream from "effect/Stream";
import * as String from "effect/String";
import * as KeyValueStore from "effect/unstable/persistence/KeyValueStore";
import { glob } from "fast-glob";
import picomatch from "picomatch";

import { CheckRunner } from "./CheckRunner.js";
import * as CheckRunnerProvider from "./CheckRunnerProvider.js";
import { CliAgentClient } from "./CliAgentClient.js";
import * as CliAgentClientProvider from "./CliAgentClientProvider.js";
import * as ConfigResolver from "./ConfigResolver.js";
import * as Constants from "./Constants.js";
import * as Context0 from "./Context0.js";
import * as Feedback from "./Feedback.js";
import * as FileFilter from "./FileFilter.js";
import { FileHasher } from "./FileHasher.js";
import * as FileHasherProvider from "./FileHasherProvider.js";
import * as Lockfile from "./Lockfile.js";
import * as MarkdownAnnotations from "./MarkdownAnnotations.js";
import {
	AbsolutePath,
	FileQuery,
	RelativePath,
	type Tag,
	WorkspacePath,
} from "./Models.js";
import { CliAgents, OperationProgress } from "./References.js";
import { withTrailingSlash } from "./Utils.js";
import * as Workspace from "./Workspace.js";
import { WorkspaceService } from "./WorkspaceService.js";
import * as WorkspaceServiceProvider from "./WorkspaceServiceProvider.js";

/**
 * @group Layers
 */
export const layer = Layer.effect(
	Context0.Context0,
	Effect.gen(function* () {
		const { discover } = yield* WorkspaceService;
		const { runCheck } = yield* CheckRunner;
		const fileHasher = yield* FileHasher;
		const cliAgentClient = yield* CliAgentClient;
		const fs = yield* FileSystem.FileSystem;
		const path = yield* Path.Path;

		const makePlan = (workspace: Workspace.Workspace) => {
			return Effect.fn("plan")(function* (
				options: Context0.ReviewOptions | undefined,
			) {
				const cache = yield* pipe(
					KeyValueStore.KeyValueStore.asEffect(),
					Effect.provide(KeyValueStore.layerFileSystem(workspace.cacheDir)),
					Effect.provideService(Path.Path, path),
					Effect.provideService(FileSystem.FileSystem, fs),
				);

				const fileFilter = yield* Option.match(
					Option.fromNullishOr(options?.query),
					{
						onSome: (query) =>
							pipe(
								FileFilter.parse(FileQuery.makeUnsafe(query)),
								Result.map(Option.some),
							),
						onNone: () => Result.succeedNone,
					},
				);

				const relativeDir = pipe(
					Option.fromNullishOr(options?.dir),
					Option.map((dir) => Workspace.relativeDir(workspace, dir)),
					Option.getOrUndefined,
				);

				const plan = yield* pipe(
					Stream.fromIterable(Record.toEntries(workspace.lockfile)),
					Stream.filterMap(([file, lockinfo]) => {
						const workspacePath = WorkspacePath.makeUnsafe(`//${file}`);

						if (relativeDir === undefined) {
							return Result.succeed({
								workspacePath,
								file: workspacePath as WorkspacePath | RelativePath,
								lockinfo,
							});
						}

						if (!file.startsWith(withTrailingSlash(relativeDir))) {
							return Result.failVoid;
						}

						return Result.succeed({
							workspacePath,
							file: RelativePath.makeUnsafe(
								file.replace(withTrailingSlash(relativeDir), ""),
							),
							lockinfo,
						});
					}),
					Stream.filter(({ file, lockinfo }) =>
						fileFilter._tag === "None"
							? true
							: FileFilter.matches(fileFilter.value, file, lockinfo),
					),
					Stream.mapAccumEffect(
						() =>
							({
								reviewedWithFeedback: [],
								reviewedWithoutFeedback: [],
								pending: [],
							}) as Context0.PlanReturnType,
						Effect.fnUntraced(function* (
							acc,
							{ file, lockinfo, workspacePath },
						) {
							const _succeed = (acc: Context0.PlanReturnType) => {
								return [acc, [acc]] as const;
							};

							if (lockinfo.hash._tag === "None") {
								return _succeed({
									...acc,
									pending: Array.append(acc.pending, file),
								});
							}

							const hash = yield* fileHasher.hash(workspace, workspacePath, [
								"review",
							]);
							if (lockinfo.hash.value !== hash) {
								return _succeed({
									...acc,
									pending: Array.append(acc.pending, file),
								});
							}

							const cacheExists = yield* cache.has(hash);
							if (cacheExists) {
								return _succeed({
									...acc,
									reviewedWithFeedback: Array.append(
										acc.reviewedWithFeedback,
										file,
									),
								});
							}

							return _succeed({
								...acc,
								reviewedWithoutFeedback: Array.append(
									acc.reviewedWithoutFeedback,
									file,
								),
							});
						}),
					),
					Stream.runLast,
				);

				return Option.getOrElse(plan, () => ({
					pending: [],
					reviewedWithFeedback: [],
					reviewedWithoutFeedback: [],
				})) as
					| Context0.PlanReturnType<WorkspacePath>
					| Context0.PlanReturnType<RelativePath>;
			});
		};

		const isContext = picomatch(
			`**/${Constants.CONTEXT0_FOLDER_NAME}/**/*.md`,
			{
				dot: true,
			},
		);

		return {
			sync: Effect.fn("sync")(function* (options = {}) {
				const operationProgress = yield* OperationProgress;
				const workspace = yield* discover().pipe(Effect.orDie);
				const configResolver = yield* ConfigResolver.build(workspace)
					.asEffect()
					.pipe(Effect.orDie);

				const cwd = options.dir ?? workspace.rootDir;
				const files = yield* Effect.promise(() =>
					glob("**", {
						onlyFiles: true,
						cwd,
						dot: true,
						ignore: [
							...Option.flatMap(
								workspace.rootConfig,
								({ ignore }) => ignore,
							).pipe(Option.getOrElse(() => [])),
						],
					}),
				);

				yield* Ref.set(operationProgress.total, files.length);

				const initialLockfile = yield* Stream.fromArray(files).pipe(
					Stream.mapEffect(
						Effect.fnUntraced(function* (file) {
							const absolutePath = AbsolutePath.makeUnsafe(
								path.resolve(workspace.rootDir, file),
							);
							const workspacePath = WorkspacePath.makeUnsafe(
								path.resolve(cwd, file).replace(workspace.rootDir, "/"),
							);

							const configGroup = ConfigResolver.resolveGroup(
								configResolver,
								absolutePath,
							).pipe(Option.getOrThrow);

							const annotations = yield* fs.readFileString(absolutePath).pipe(
								Effect.catchTags({ PlatformError: Effect.die }),
								Effect.andThen((markdown) =>
									MarkdownAnnotations.fromMarkdown(
										markdown,
										workspacePath,
										configGroup,
									).asEffect(),
								),
								Effect.when(Effect.succeed(isContext(workspacePath))),
							);

							const targetTags = options.tags ?? [];
							const tagOrder = Array.isReadonlyArrayNonEmpty(targetTags)
								? Array.filter(configGroup.tagOrder, (tag) =>
										targetTags.includes(tag),
									)
								: configGroup.tagOrder;

							const attachedTagsRef = yield* Ref.make(HashSet.empty<Tag>());
							yield* Effect.forEach(
								tagOrder,
								Effect.fnUntraced(function* (tag) {
									const isPassed = yield* runCheck({
										file: {
											workspacePath,
											absolutePath,
										},
										attachedTags: yield* Ref.get(attachedTagsRef),
										steps: configGroup.tagMap[tag].checks,
										configGroup,
										annotations,
									});
									if (isPassed) {
										yield* Ref.update(attachedTagsRef, HashSet.add(tag));
									}
								}),
							);

							return {
								file: RelativePath.makeUnsafe(workspacePath.replace("//", "")),
								annotations,
								tags: yield* Ref.get(attachedTagsRef),
							};
						}),
						{
							concurrency: "unbounded",
							unordered: true,
						},
					),
					Stream.tap(() =>
						Ref.update(operationProgress.current, (current) => current + 1),
					),
					Stream.runCollect,
					Effect.orDie,
				);

				const lockfile = pipe(
					initialLockfile,
					Array.map(({ file, annotations, tags }) => {
						const oldLockinfo = Record.get(workspace.lockfile, file);
						return [
							file,
							{
								annotations,
								tags: Option.map(oldLockinfo, (oldLockinfo) => {
									if (options.tags === undefined || options.tags.length === 0)
										return [];
									return oldLockinfo.tags.filter(
										(tag) => !options.tags?.includes(tag),
									);
								}).pipe(
									Option.map(Array.appendAll(Array.fromIterable(tags))),
									Option.getOrElse(() => Array.fromIterable(tags)),
								),
								hash: Option.flatMap(oldLockinfo, ({ hash }) => hash),
							} satisfies Lockfile.Lockfile[RelativePath],
						] as const;
					}),
					Record.fromEntries,
				) satisfies Lockfile.Lockfile;

				yield* fs
					.writeFileString(
						path.resolve(workspace.rootDir, Constants.CONTEXT0_LOCK_FILE_NAME),
						Lockfile.toString(
							workspace.rootDir === cwd
								? lockfile
								: Record.union(
										lockfile,
										Record.filter(
											workspace.lockfile,
											(_, key) =>
												!path.resolve(workspace.rootDir, key).startsWith(cwd),
										),
										identity,
									),
						),
					)
					.pipe(Effect.catchTags({ PlatformError: Effect.die }));
			}),

			search: Effect.fn("search")(function* (query, options) {
				const workspace = yield* discover().pipe(Effect.orDie);
				const fileFilter = yield* FileFilter.parse(FileQuery.makeUnsafe(query))
					.asEffect()
					.pipe(Effect.orDie);

				const dir = options?.dir;
				const relativeDir = dir
					? Workspace.relativeDir(workspace, dir)
					: undefined;

				if (relativeDir === undefined) {
					return yield* Stream.fromIterable(
						Record.toEntries(workspace.lockfile),
					).pipe(
						Stream.map(([file, lockinfo]) => {
							return {
								file: WorkspacePath.makeUnsafe(`//${file}`),
								lockinfo,
							};
						}),
						Stream.filter(({ file, lockinfo }) =>
							FileFilter.matches(fileFilter, file, lockinfo),
						),
						Stream.map(({ file }) => file),
						Stream.runCollect,
					);
				}

				return yield* Stream.fromIterable(
					Record.toEntries(workspace.lockfile),
				).pipe(
					Stream.filterMap(([file, lockinfo]) => {
						if (!file.startsWith(withTrailingSlash(relativeDir))) {
							return Result.failVoid;
						}

						return Result.succeed({
							file: RelativePath.makeUnsafe(
								file.replace(withTrailingSlash(relativeDir), ""),
							),
							lockinfo,
						});
					}),
					Stream.filter(({ file, lockinfo }) =>
						FileFilter.matches(fileFilter, file, lockinfo),
					),
					Stream.map(({ file }) => file),
					Stream.runCollect,
				);
			}),

			describe: Effect.fn("describe")(function* (file, options) {
				const workspace = yield* discover().pipe(Effect.orDie);
				const workspacePath = WorkspacePath.makeUnsafe(
					file.replace(workspace.rootDir, "/"),
				);
				const configResolver = yield* ConfigResolver.build(workspace)
					.asEffect()
					.pipe(Effect.orDie);
				const configGroup = ConfigResolver.resolveGroup(
					configResolver,
					file,
				).pipe(Option.getOrThrow);

				const lockinfo = yield* Lockfile.fileInfo(
					workspace.lockfile,
					workspacePath,
				)
					.asEffect()
					.pipe(Effect.orDie);
				const contextFiles = yield* Lockfile.fileContext(
					workspace.lockfile,
					workspacePath,
					options?.scope ?? "all",
				)
					.asEffect()
					.pipe(Effect.orDie);

				return {
					tags: lockinfo.tags.map((tag) => {
						return {
							name: tag,
							description: Record.get(configGroup.tagMap, tag).pipe(
								Option.flatMap(({ description }) => description),
								Option.getOrElse(() => ""),
							),
						};
					}),
					context: contextFiles.map((contextFile) => {
						const annotations = Lockfile.fileInfo(
							workspace.lockfile,
							contextFile,
						).pipe(
							Result.match({
								onFailure: () =>
									Option.none<MarkdownAnnotations.MarkdownAnnotations>(),
								onSuccess: ({ annotations }) => annotations,
							}),
						);
						return {
							path: contextFile,
							scope: annotations.pipe(
								Option.map(({ scope }) => scope),
								Option.getOrElse(() => "all" as const),
							),
							description: annotations.pipe(
								Option.flatMap(({ description }) => description),
								Option.getOrElse(() => ""),
							),
						};
					}),
				};
			}),

			check: Effect.fn("check")(function* () {
				return 1 as any;
			}),

			review: Effect.fn("review")(function* (options) {
				const workspace = yield* pipe(discover(), Effect.orDie);
				const plan = yield* pipe(makePlan(workspace)(options), Effect.orDie);
				const cwd = options?.dir ?? workspace.rootDir;

				return yield* Effect.forEach(
					options?.refresh
						? [...plan.pending, ...plan.reviewedWithoutFeedback]
						: plan.pending,
					Effect.fnUntraced(function* (file) {
						const workspacePath = SchemaParser.is(WorkspacePath)(file)
							? file
							: WorkspacePath.makeUnsafe(
									path.resolve(cwd, file).replace(workspace.rootDir, "/"),
								);
						const absolutePath = AbsolutePath.makeUnsafe(
							path.resolve(workspace.rootDir, workspacePath.replace("/", ".")),
						);
						const relativePath = RelativePath.makeUnsafe(
							absolutePath.replace(withTrailingSlash(workspace.rootDir), ""),
						);

						const contextFiles = yield* Effect.forEach(
							yield* Lockfile.fileContext(workspace.lockfile, workspacePath, [
								"review",
							]),
							Effect.fnUntraced(function* (contextFile) {
								const absolutePath = AbsolutePath.makeUnsafe(
									path.resolve(
										workspace.rootDir,
										contextFile.replace("/", "."),
									),
								);
								return pipe(
									Constants.REVIEW_CONTEXT_FILE_TEMPLATE,
									String.replaceAll(
										Constants.REVIEW_CONTEXT_FILE_PLACEHOLDERS.RELATIVE_PATH,
										RelativePath.makeUnsafe(
											absolutePath.replace(
												withTrailingSlash(workspace.rootDir),
												"",
											),
										),
									),
									String.replaceAll(
										Constants.REVIEW_CONTEXT_FILE_PLACEHOLDERS.DESCRIPTION,
										yield* Lockfile.fileInfo(
											workspace.lockfile,
											contextFile,
										).pipe(
											Result.map(({ annotations }) => annotations),
											Result.map(
												Option.flatMap(({ description }) => description),
											),
											Result.map(Option.getOrElse(() => "")),
										),
									),
								);
							}),
						);

						if (contextFiles.length === 0) {
							return {
								path: file,
								feedback: [],
							};
						}

						const cliAgents = options?.cliAgent
							? [options.cliAgent]
							: yield* CliAgents;

						const feedback = yield* cliAgentClient
							.query({
								cwd: workspace.rootDir,
								prompt: pipe(
									Constants.REVIEW_PROMPT,
									String.replaceAll(
										Constants.REVIEW_PROMPT_PLACEHOLDERS.ROOT_DIR,
										workspace.rootDir,
									),
									String.replaceAll(
										Constants.REVIEW_PROMPT_PLACEHOLDERS.TARGET_FILE_PATH,
										relativePath,
									),
									String.replaceAll(
										Constants.REVIEW_PROMPT_PLACEHOLDERS
											.TARGET_FILE_DESCRIPTION,
										yield* Lockfile.fileInfo(
											workspace.lockfile,
											workspacePath,
										).pipe(
											Result.map(({ annotations }) => annotations),
											Result.map(
												Option.flatMap(({ description }) => description),
											),
											Result.map(Option.getOrElse(() => "")),
										),
									),
									String.replaceAll(
										Constants.REVIEW_PROMPT_PLACEHOLDERS.CONTEXT_FILES,
										contextFiles.join("\n"),
									),
								),
							})
							.pipe(
								Effect.provideService(CliAgents, cliAgents),
								Effect.tap((rawFeedback) =>
									Effect.logDebug("Raw feedback: ", rawFeedback),
								),
								Effect.andThen(Feedback.fromLlmOutput(workspace.rootDir)),
								Effect.provideService(FileSystem.FileSystem, fs),
								Effect.provideService(Path.Path, path),
								Effect.orDie,
							);

						return { path: file, feedback };
					}),
					{
						concurrency: options?.parallel ?? 10,
					},
				).pipe(Effect.orDie);
			}),

			plan: Effect.fnUntraced(function* (options) {
				const workspace = yield* pipe(discover(), Effect.orDie);
				return yield* pipe(makePlan(workspace)(options), Effect.orDie);
			}),
		};
	}),
);

/**
 * @group Layers
 */
export const live = layer.pipe(
	Layer.provide([
		WorkspaceServiceProvider.live,
		CheckRunnerProvider.live,
		CliAgentClientProvider.live,
		FileHasherProvider.live,
	]),
);

import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import { flow, identity, pipe } from "effect/Function";
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
	type Scope,
	type Tag,
	WorkspacePath,
} from "./Models.js";
import { CliAgents, OperationProgress } from "./References.js";
import { withTrailingSlash } from "./Utils.js";
import * as Workspace from "./Workspace.js";
import { WorkspaceService } from "./WorkspaceService.js";
import * as WorkspaceServiceProvider from "./WorkspaceServiceProvider.js";
import * as YamlSerializer from "./YamlSerializer.js";

const _reviewScope: Scope = ["review"];

const _makePlan = Effect.gen(function* () {
	const fileHasher = yield* FileHasher;
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;
	return (workspace: Workspace.Workspace) =>
		Effect.fn("plan")(function* (options: Context0.ReviewOptions | undefined) {
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

			const filteredFilesStream = pipe(
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
			);

			if (options?.refresh) {
				const pending = yield* filteredFilesStream.pipe(
					Stream.mapEffect(
						Effect.fnUntraced(function* ({ file, workspacePath }) {
							return {
								path: file,
								contextFiles: yield* Lockfile.fileContext(
									workspace.lockfile,
									workspacePath,
									_reviewScope,
								),
							};
						}),
					),
					Stream.runCollect,
				);
				return identity<Context0.PlanReturnType>({
					pending,
					reviewedWithFeedback: [],
					reviewedWithoutFeedback: [],
				}) as
					| Context0.PlanReturnType<WorkspacePath>
					| Context0.PlanReturnType<RelativePath>;
			}

			const plan = yield* pipe(
				filteredFilesStream,
				Stream.scanEffect(
					identity<Context0.PlanReturnType>({
						reviewedWithFeedback: [],
						reviewedWithoutFeedback: [],
						pending: [],
					}),
					Effect.fnUntraced(function* (acc, { file, lockinfo, workspacePath }) {
						const contextFiles = yield* Lockfile.fileContext(
							workspace.lockfile,
							workspacePath,
							_reviewScope,
						);

						if (lockinfo.hash._tag === "None") {
							return {
								...acc,
								pending: Array.append(acc.pending, {
									path: file,
									contextFiles,
								}),
							};
						}

						const hash = yield* fileHasher.hash(
							workspace,
							workspacePath,
							_reviewScope,
						);
						if (lockinfo.hash.value !== hash) {
							return {
								...acc,
								pending: Array.append(acc.pending, {
									path: file,
									contextFiles,
								}),
							};
						}

						const cacheExists = yield* cache.has(hash);
						if (cacheExists) {
							return {
								...acc,
								reviewedWithFeedback: Array.append(acc.reviewedWithFeedback, {
									path: file,
									contextFiles,
								}),
							};
						}

						return {
							...acc,
							reviewedWithoutFeedback: Array.append(
								acc.reviewedWithoutFeedback,
								{ path: file, contextFiles },
							),
						};
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
});

const _makeSync = Effect.gen(function* () {
	const { discover } = yield* WorkspaceService;
	const { runCheck } = yield* CheckRunner;
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;

	const isContext = picomatch(`**/${Constants.CONTEXT0_FOLDER_NAME}/**/*.md`, {
		dot: true,
	});

	return Effect.fn("sync")(function* (
		options: Context0.SyncOptions | undefined = {},
	) {
		const operationProgress = yield* OperationProgress;
		const workspace = yield* discover().pipe(Effect.orDie);
		const configResolver = yield* ConfigResolver.build(workspace);

		const cwd = options.dir ?? workspace.rootDir;
		const files = yield* Effect.promise(() =>
			glob("**", {
				onlyFiles: true,
				cwd,
				dot: true,
				ignore: [
					...Option.flatMap(workspace.rootConfig, ({ ignore }) => ignore).pipe(
						Option.getOrElse(() => []),
					),
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
		);

		const newLockfile = pipe(
			initialLockfile,
			Array.map(({ file, annotations, tags }) => {
				const oldLockinfo = Record.get(workspace.lockfile, file);
				return [
					file,
					identity<Lockfile.Lockfile[RelativePath]>({
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
					}),
				] as const;
			}),
			Record.fromEntries,
		);

		yield* fs.writeFileString(
			path.resolve(workspace.rootDir, Constants.CONTEXT0_LOCK_FILE_NAME),
			Lockfile.toString(
				workspace.rootDir === cwd
					? newLockfile
					: Record.union(
							newLockfile,
							Record.filter(
								workspace.lockfile,
								(_, key) =>
									!path.resolve(workspace.rootDir, key).startsWith(cwd),
							),
							identity,
						),
			),
		);
	});
});

const _makeSearch = Effect.gen(function* () {
	const { discover } = yield* WorkspaceService;
	return Effect.fn("search")(function* (
		query: FileQuery,
		options: Context0.SearchOptions | undefined,
	) {
		const workspace = yield* discover();
		const fileFilter = yield* FileFilter.parse(FileQuery.makeUnsafe(query));

		const dir = options?.dir;
		const relativeDir = dir ? Workspace.relativeDir(workspace, dir) : undefined;

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
	});
});

const _makeDescribe = Effect.gen(function* () {
	const { discover } = yield* WorkspaceService;
	return Effect.fn("describe")(function* (
		file: AbsolutePath,
		options: Context0.DescribeOptions | undefined,
	) {
		const workspace = yield* discover();
		const workspacePath = WorkspacePath.makeUnsafe(
			file.replace(workspace.rootDir, "/"),
		);
		const configResolver = yield* ConfigResolver.build(workspace);
		const configGroup = ConfigResolver.resolveGroup(configResolver, file).pipe(
			Option.getOrThrow,
		);

		const lockinfo = yield* Lockfile.fileInfo(
			workspace.lockfile,
			workspacePath,
		);
		const contextFiles = yield* Lockfile.fileContext(
			workspace.lockfile,
			workspacePath,
			options?.scope ?? "all",
		);

		return identity<Context0.DescribeReturnType>({
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
		});
	});
});

const _makeReview = Effect.gen(function* () {
	const { discover } = yield* WorkspaceService;
	const cliAgentClient = yield* CliAgentClient;
	const fileHasher = yield* FileHasher;
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;
	const makePlan = yield* _makePlan;

	const _buildReviewContextFile = (params: {
		relativePath: RelativePath;
		description: string;
	}) => {
		return pipe(
			Constants.REVIEW_CONTEXT_FILE_TEMPLATE,
			String.replaceAll(
				Constants.REVIEW_CONTEXT_FILE_PLACEHOLDERS.RELATIVE_PATH,
				params.relativePath,
			),
			String.replaceAll(
				Constants.REVIEW_CONTEXT_FILE_PLACEHOLDERS.DESCRIPTION,
				params.description,
			),
		);
	};

	const _buildReviewPrompt = (params: {
		targetFilePath: RelativePath;
		targetFileDescription: string;
		contextFiles: string[];
	}) => {
		return pipe(
			Constants.REVIEW_PROMPT,
			String.replaceAll(
				Constants.REVIEW_PROMPT_PLACEHOLDERS.TARGET_FILE_PATH,
				params.targetFilePath,
			),
			String.replaceAll(
				Constants.REVIEW_PROMPT_PLACEHOLDERS.TARGET_FILE_DESCRIPTION,
				params.targetFileDescription,
			),
			String.replaceAll(
				Constants.REVIEW_PROMPT_PLACEHOLDERS.CONTEXT_FILES,
				params.contextFiles.join("\n"),
			),
		);
	};

	return Effect.fn("review")(function* (
		options: Context0.ReviewOptions | undefined,
	) {
		const workspace = yield* discover();
		const plan = yield* makePlan(workspace)(options);
		const cwd = options?.dir ?? workspace.rootDir;

		const rawReview = yield* Effect.forEach(
			plan.pending,
			Effect.fnUntraced(function* ({ path: file, contextFiles }) {
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

				const hash = yield* fileHasher.hash(
					workspace,
					workspacePath,
					_reviewScope,
				);

				if (contextFiles.length === 0) {
					return {
						hash,
						absolutePath,
						workspacePath,
						relativePath,
						path: file,
						feedback: [],
					};
				}

				const rawFeedback = yield* cliAgentClient
					.query({
						cwd: workspace.rootDir,
						prompt: _buildReviewPrompt({
							targetFilePath: relativePath,
							targetFileDescription: yield* Lockfile.fileInfo(
								workspace.lockfile,
								workspacePath,
							).pipe(
								Result.map(({ annotations }) => annotations),
								Result.map(Option.flatMap(({ description }) => description)),
								Result.map(Option.getOrElse(() => "")),
							),
							contextFiles: yield* Effect.forEach(
								contextFiles,
								Effect.fnUntraced(function* (contextFile) {
									const absolutePath = AbsolutePath.makeUnsafe(
										path.resolve(
											workspace.rootDir,
											contextFile.replace("/", "."),
										),
									);
									return _buildReviewContextFile({
										relativePath: RelativePath.makeUnsafe(
											absolutePath.replace(
												withTrailingSlash(workspace.rootDir),
												"",
											),
										),
										description: yield* Lockfile.fileInfo(
											workspace.lockfile,
											contextFile,
										).pipe(
											Result.map(({ annotations }) => annotations),
											Result.map(
												Option.flatMap(({ description }) => description),
											),
											Result.map(Option.getOrElse(() => "")),
										),
									});
								}),
							),
						}),
					})
					.pipe(
						Effect.provideService(
							CliAgents,
							options?.cliAgent ? [options.cliAgent] : yield* CliAgents,
						),
						Effect.tap((rawFeedback) =>
							Effect.logDebug("Raw feedback: ", rawFeedback),
						),
					);

				return {
					hash,
					absolutePath,
					workspacePath,
					relativePath,
					path: file,
					feedback: yield* Feedback.fromLlmOutput(
						rawFeedback,
						workspace.rootDir,
					).pipe(
						Effect.provideService(FileSystem.FileSystem, fs),
						Effect.provideService(Path.Path, path),
					),
				};
			}),
			{
				concurrency: options?.parallel ?? 10,
			},
		);

		const cache = yield* pipe(
			KeyValueStore.KeyValueStore.asEffect(),
			Effect.provide(KeyValueStore.layerFileSystem(workspace.cacheDir)),
			Effect.provideService(Path.Path, path),
			Effect.provideService(FileSystem.FileSystem, fs),
		);

		yield* Effect.forEach(rawReview, ({ hash, path, feedback }) =>
			cache.set(
				hash,
				YamlSerializer.serialize(
					identity<Context0.ReviewReturnType[number]>({
						feedback,
						path,
					}),
				),
			),
		);

		const newLockfile = pipe(
			rawReview,
			Array.filter(({ feedback }) => {
				return !feedback.some(
					({ level }) => Option.getOrUndefined(level) === "red",
				);
			}),
			Array.map(
				({ relativePath, hash }) =>
					[
						relativePath,
						identity<Lockfile.Lockfile[RelativePath]>({
							annotations: pipe(
								Record.get(workspace.lockfile, relativePath),
								Option.flatMap(({ annotations }) => annotations),
							),
							tags: pipe(
								Record.get(workspace.lockfile, relativePath),
								Option.map(({ tags }) => tags),
								Option.getOrElse(() => []),
							),
							hash: Option.some(hash),
						}),
					] as const,
			),
			Record.fromEntries,
			Record.union(workspace.lockfile, identity),
		);

		yield* fs.writeFileString(
			path.resolve(workspace.rootDir, Constants.CONTEXT0_LOCK_FILE_NAME),
			Lockfile.toString(newLockfile),
		);

		return identity<Context0.ReviewReturnType>(
			rawReview.map(({ path, feedback }) => {
				return identity<Context0.ReviewReturnType[number]>({
					feedback,
					path,
				});
			}),
		);
	});
});

/**
 * @group Layers
 */
export const layer = Layer.effect(
	Context0.Context0,
	Effect.gen(function* () {
		const { discover } = yield* WorkspaceService;

		const makePlan = yield* _makePlan;
		const sync = yield* _makeSync;
		const search = yield* _makeSearch;
		const describe = yield* _makeDescribe;
		const review = yield* _makeReview;

		return {
			sync: flow(sync, Effect.orDie),
			search: flow(search, Effect.orDie),
			describe: flow(describe, Effect.orDie),
			check: Effect.fn("check")(function* () {
				return 1 as any;
			}),
			review: flow(review, Effect.orDie),
			plan: Effect.fnUntraced(function* (options) {
				const workspace = yield* discover();
				return yield* makePlan(workspace)(options);
			}, Effect.orDie),
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

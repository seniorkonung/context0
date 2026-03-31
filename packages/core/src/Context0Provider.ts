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
import * as Stream from "effect/Stream";
import { glob } from "fast-glob";
import picomatch from "picomatch";

import { CheckRunner } from "./CheckRunner.js";
import * as CheckRunnerProvider from "./CheckRunnerProvider.js";
import * as ConfigResolver from "./ConfigResolver.js";
import * as Constants from "./Constants.js";
import * as Context0 from "./Context0.js";
import { FileNotInDirectory } from "./Errors.js";
import * as FileFilter from "./FileFilter.js";
import * as Lockfile from "./Lockfile.js";
import * as MarkdownAnnotations from "./MarkdownAnnotations.js";
import {
	AbsolutePath,
	FileQuery,
	RelativePath,
	type Tag,
	WorkspacePath,
} from "./Models.js";
import { OperationProgress } from "./References.js";
import { withTrailingSlash } from "./Utils.js";
import * as Workspace from "./Workspace.js";
import { WorkspaceService } from "./WorkspaceService.js";
import * as WorkspaceServiceProvider from "./WorkspaceServiceProvider.js";

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
		if (options.file && !options.file.startsWith(cwd)) {
			return yield* new FileNotInDirectory({
				dir: cwd,
				file: options.file,
			});
		}

		const files = options.file
			? [options.file.replace(withTrailingSlash(cwd), "")]
			: yield* Effect.promise(() =>
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
	return Effect.fn("describe")(function* (file: AbsolutePath) {
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
					description: annotations.pipe(
						Option.flatMap(({ description }) => description),
						Option.getOrElse(() => ""),
					),
				};
			}),
		});
	});
});

/**
 * @group Layers
 */
export const layer = Layer.effect(
	Context0.Context0,
	Effect.gen(function* () {
		const sync = yield* _makeSync;
		const search = yield* _makeSearch;
		const describe = yield* _makeDescribe;

		return {
			sync: flow(sync, Effect.orDie),
			search: flow(search, Effect.orDie),
			describe: flow(describe, Effect.orDie),
		};
	}),
);

/**
 * @group Layers
 */
export const live = layer.pipe(
	Layer.provide([WorkspaceServiceProvider.live, CheckRunnerProvider.live]),
);

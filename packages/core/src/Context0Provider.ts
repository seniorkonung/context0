import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import { pipe } from "effect/Function";
import * as HashSet from "effect/HashSet";
import * as Layer from "effect/Layer";
import * as Match from "effect/Match";
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
import { CONTEXT0_FOLDER_NAME, CONTEXT0_LOCK_FILE_NAME } from "./Constants.js";
import { Context0 } from "./Context0.js";
import { FileNotFound } from "./Errors.js";
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
import { WorkspaceService } from "./Workspace.js";
import * as WorkspaceServiceProvider from "./WorkspaceServiceProvider.js";

/**
 * @group Layers
 */
export const layer = Layer.effect(
	Context0,
	Effect.gen(function* () {
		const { discover } = yield* WorkspaceService;
		const { runCheck } = yield* CheckRunner;
		const fs = yield* FileSystem.FileSystem;
		const path = yield* Path.Path;

		const isContext = picomatch(`**/${CONTEXT0_FOLDER_NAME}/**/*.md`, {
			dot: true,
		});

		return {
			sync: Effect.fn("sync")(function* () {
				const workspace = yield* discover().pipe(Effect.orDie);
				const configResolver = yield* ConfigResolver.build(workspace)
					.asEffect()
					.pipe(Effect.orDie);

				const files = yield* Effect.promise(() =>
					glob("**", {
						onlyFiles: true,
						cwd: workspace.rootDir,
						dot: true,
						ignore: [
							...Option.flatMap(
								workspace.rootConfig,
								({ ignore }) => ignore,
							).pipe(Option.getOrElse(() => [])),
						],
					}),
				);

				const initialLockfile = yield* Stream.fromArray(files).pipe(
					Stream.mapEffect(
						Effect.fnUntraced(function* (file) {
							const absolutePath = AbsolutePath.makeUnsafe(
								path.resolve(workspace.rootDir, file),
							);
							const workspacePath = WorkspacePath.makeUnsafe(`//${file}`);

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
								Effect.when(Effect.succeed(isContext(file))),
							);

							const attachedTagsRef = yield* Ref.make(HashSet.empty<Tag>());
							yield* Effect.forEach(
								configGroup.tagOrder,
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
								file: RelativePath.makeUnsafe(file),
								annotations,
								tags: yield* Ref.get(attachedTagsRef),
							};
						}),
						{
							concurrency: 100,
							unordered: true,
						},
					),
					Stream.runCollect,
					Effect.orDie,
				);

				const lockfile = pipe(
					initialLockfile,
					Array.map(({ file, annotations, tags }) => {
						const oldLockfile = Record.get(workspace.lockfile, file);
						return [
							file,
							{
								annotations,
								tags: Array.fromIterable(tags),
								hash: Option.flatMap(oldLockfile, ({ hash }) => hash),
							} satisfies Lockfile.Lockfile[RelativePath],
						] as const;
					}),
					Record.fromEntries,
				) satisfies Lockfile.Lockfile;

				yield* fs
					.writeFileString(
						path.resolve(workspace.rootDir, CONTEXT0_LOCK_FILE_NAME),
						Lockfile.toString(lockfile),
					)
					.pipe(Effect.catchTags({ PlatformError: Effect.die }));
			}),

			search: Effect.fn("search")(function* (query, scope) {
				const workspace = yield* discover().pipe(Effect.orDie);
				const fileFilter = yield* FileFilter.parse(FileQuery.makeUnsafe(query))
					.asEffect()
					.pipe(Effect.orDie);

				const withTrailingSlash = (s: string) => {
					return s.length === 0 ? s : s.endsWith("/") ? s : `${s}/`;
				};
				const relativeCwd =
					path.resolve(".") === workspace.rootDir
						? ""
						: path
								.resolve(".")
								.slice(withTrailingSlash(workspace.rootDir).length);

				const files = yield* Stream.fromIterable(
					Record.toEntries(workspace.lockfile),
				).pipe(
					Stream.filterMap(([file, lockinfo]) => {
						return Match.value({
							scope: scope as Context0.SearchScope,
						}).pipe(
							Match.discriminators("scope")({
								workspace: () => {
									return Result.succeed({
										file: WorkspacePath.makeUnsafe(`//${file}`),
										lockinfo,
									});
								},
								cwd: () => {
									if (!file.startsWith(withTrailingSlash(relativeCwd)))
										return Result.failVoid;
									return Result.succeed({
										file: RelativePath.makeUnsafe(
											file.replace(withTrailingSlash(relativeCwd), ""),
										),
										lockinfo,
									});
								},
							}),
							Match.exhaustive,
						);
					}),
					Stream.filter(({ file, lockinfo }) =>
						FileFilter.matches(fileFilter, file, lockinfo),
					),
					Stream.map(({ file }) => file),
					Stream.runCollect,
				);

				return files as Context0.SearchReturnType<typeof scope>;
			}),

			describe: Effect.fn("describe")(function* (file) {
				const workspace = yield* discover().pipe(Effect.orDie);
				const workspacePath = WorkspacePath.makeUnsafe(
					file.replace(`${workspace.rootDir}/`, "//"),
				);
				const configResolver = yield* ConfigResolver.build(workspace)
					.asEffect()
					.pipe(Effect.orDie);
				const configGroup = ConfigResolver.resolveGroup(
					configResolver,
					file,
				).pipe(Option.getOrThrow);

				return yield* Option.all({
					lockinfo: Lockfile.fileInfo(workspace.lockfile, workspacePath),
					context: Lockfile.fileContext(workspace.lockfile, workspacePath),
				})
					.asEffect()
					.pipe(
						Effect.map(({ lockinfo, context }) => {
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
								context: context.map((contextFile) => {
									return {
										path: contextFile,
										description: Lockfile.fileInfo(
											workspace.lockfile,
											contextFile,
										).pipe(
											Option.flatMap(({ annotations }) => annotations),
											Option.flatMap(({ description }) => description),
											Option.getOrElse(() => ""),
										),
									};
								}),
							};
						}),
						Effect.catchTag("NoSuchElementError", () =>
							new FileNotFound({ file }).asEffect(),
						),
						Effect.orDie,
					);
			}),

			check: Effect.fn("check")(function* () {
				return 1 as any;
			}),

			review: Effect.fn("review")(function* () {
				return 1 as any;
			}),
		};
	}),
);

/**
 * @group Layers
 */
export const live = Layer.effect(Context0, Context0.asEffect()).pipe(
	Layer.provide([layer]),
	Layer.provide([WorkspaceServiceProvider.live, CheckRunnerProvider.live]),
);

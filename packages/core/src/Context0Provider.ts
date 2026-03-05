import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import { pipe } from "effect/Function";
import * as HashSet from "effect/HashSet";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Record from "effect/Record";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";
import { glob } from "fast-glob";
import picomatch from "picomatch";

import { CheckRunner } from "./CheckRunner.js";
import * as CheckRunnerProvider from "./CheckRunnerProvider.js";
import * as ConfigResolver from "./ConfigResolver.js";
import { CONTEXT0_FOLDER_NAME, CONTEXT0_LOCK_FILE_NAME } from "./Constants.js";
import { Context0 } from "./Context0.js";
import { SyncFailed } from "./Errors.js";
import * as Lockfile from "./Lockfile.js";
import * as MarkdownAnnotations from "./MarkdownAnnotations.js";
import {
	AbsolutePath,
	type Pattern,
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

		const isContext = picomatch(`**/${CONTEXT0_FOLDER_NAME}/**/*.md`);

		return {
			sync: Effect.fn("sync")(
				function* () {
					const workspace = yield* discover();
					const configResolver = yield* ConfigResolver.build(workspace);

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

								const annotations = yield* fs.readFileString(file).pipe(
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
								concurrency: 2,
								unordered: true,
							},
						),
						Stream.runCollect,
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
									requiredTags: Option.map(
										oldLockfile,
										({ requiredTags }) => requiredTags,
									).pipe(Option.getOrElse(() => [])),
								} satisfies Lockfile.Lockfile[RelativePath],
							] as const;
						}),
						Record.fromEntries,
					) satisfies Lockfile.Lockfile;

					yield* fs
						.writeFileString(
							CONTEXT0_LOCK_FILE_NAME,
							Lockfile.toString(lockfile),
						)
						.pipe(Effect.catchTags({ PlatformError: Effect.die }));
				},
				Effect.catch((reason) => new SyncFailed({ reason }).asEffect()),
			),

			updateRequiredTags: Effect.fn("updateRequiredTags")(function* () {
				return 1 as any;
			}),
			check: Effect.fn("check")(function* () {
				return 1 as any;
			}),
			getContext: Effect.fn("getContext")(function* () {
				return 1 as any;
			}),
			getFiles: Effect.fn("getFiles")(function* () {
				return 1 as any;
			}),
			getRequiredTags: Effect.fn("getRequiredTags")(function* () {
				return 1 as any;
			}),
			getTags: Effect.fn("getTags")(function* (
				...patterns: ReadonlyArray<Pattern>
			) {
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

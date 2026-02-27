import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as SchemaIssue from "effect/SchemaIssue";
import * as SchemaParser from "effect/SchemaParser";
import { glob } from "fast-glob";
import { load } from "js-yaml";

import {
	CONTEXT0_CONFIG_FILE_NAME,
	CONTEXT0_LOCK_FILE_NAME,
} from "./Constants.js";
import * as Context0 from "./Context0.js";
import {
	RootDirNotFound,
	type Workspace,
	WorkspaceService,
} from "./Workspace.js";

/**
 * @group Layers
 */
export const layer = Layer.effect(
	WorkspaceService,
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const path = yield* Path.Path;
		return {
			init: Effect.fn("init")(function* () {
				return 1 as any;
			}),

			discover: Effect.fn("discover")(function* (_startDir) {
				const startDir = Context0.Path.makeUnsafe(
					path.resolve(_startDir ?? "."),
				);

				const findRootDir = (
					dir: string,
				): Effect.Effect<Option.Option<string>> =>
					Effect.gen(function* () {
						const lockfileExists = yield* fs
							.exists(path.resolve(dir, `./${CONTEXT0_LOCK_FILE_NAME}`))
							.pipe(Effect.orDie);
						if (lockfileExists) return Option.some(dir);
						else if (dir === "/") return Option.none();
						else return yield* findRootDir(path.resolve(dir, "../"));
					});

				const rootDir = yield* findRootDir(startDir).pipe(
					Effect.andThen(Effect.fromOption),
					Effect.catchTags({
						NoSuchElementError: () =>
							new RootDirNotFound({
								startDir,
							}).asEffect(),
					}),
					Effect.andThen(SchemaParser.decodeEffect(Context0.Path)),
					Effect.catchIf(SchemaIssue.isIssue, Effect.die),
				);

				const rootConfig = yield* fs
					.readFileString(path.resolve(rootDir, CONTEXT0_CONFIG_FILE_NAME))
					.pipe(
						Effect.andThen((content) => Effect.sync(() => load(content))),
						Effect.andThen(
							SchemaParser.decodeUnknownEffect(Context0.RootConfig),
						),
						Effect.catchIf(SchemaIssue.isIssue, Effect.die),
						Effect.when(
							fs.exists(path.resolve(rootDir, CONTEXT0_CONFIG_FILE_NAME)),
						),
					);

				const entrypoints = yield* Effect.succeed(
					Option.getOrElse(
						Option.flatMap(rootConfig, ({ entrypoints }) => entrypoints),
						() => [],
					),
				).pipe(
					Effect.andThen(
						Effect.forEach(
							Effect.fnUntraced(function* (pattern) {
								return yield* Effect.promise(() =>
									glob(pattern, {
										cwd: rootDir,
										onlyDirectories: true,
										dot: true,
									}),
								);
							}),
						),
					),
					Effect.andThen(Array.flatten),
					Effect.andThen(
						Effect.forEach(
							Effect.fnUntraced(function* (dir) {
								const dirPath = Context0.Path.makeUnsafe(
									path.resolve(rootDir, dir),
								);
								const configPath = path.resolve(
									dirPath,
									CONTEXT0_CONFIG_FILE_NAME,
								);
								return {
									dir: dirPath,
									config: yield* fs.readFileString(configPath).pipe(
										Effect.andThen((content) =>
											Effect.sync(() => load(content)),
										),
										Effect.andThen(
											SchemaParser.decodeUnknownEffect(
												Context0.EntrypointConfig,
											),
										),
										Effect.catchIf(SchemaIssue.isIssue, Effect.die),
										Effect.when(fs.exists(configPath)),
									),
								};
							}),
						),
					),
				);

				const lockfile = yield* fs
					.readFileString(path.resolve(rootDir, CONTEXT0_LOCK_FILE_NAME))
					.pipe(
						Effect.andThen((content) => Effect.sync(() => load(content))),
						Effect.andThen(SchemaParser.decodeUnknownEffect(Context0.Lockfile)),
						Effect.catchIf(SchemaIssue.isIssue, Effect.die),
					);

				return {
					_tag: "Workspace",
					entrypoints,
					lockfile,
					rootConfig,
					rootDir,
				} satisfies Workspace;
			}),
		};
	}),
);

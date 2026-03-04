import * as Array from "effect/Array";
import * as Boolean from "effect/Boolean";
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
	CONTEXT0_LOCK_FILE_DEFAULT_CONTENT,
	CONTEXT0_LOCK_FILE_NAME,
	CONTEXT0_ROOT_CONFIG_FILE_DEFAULT_CONTENT,
} from "./Constants.js";
import {
	InvalidEntrypointConfig,
	InvalidLockfile,
	InvalidRootConfig,
	RootDirAlreadyDefined,
	RootDirNotFound,
} from "./Errors.js";
import { Lockfile } from "./Lockfile.js";
import { AbsolutePath, EntrypointConfig, RootConfig } from "./Models.js";
import { type Workspace, WorkspaceService } from "./Workspace.js";

/**
 * @group Layers
 */
export const layer = Layer.effect(
	WorkspaceService,
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const path = yield* Path.Path;

		const discover = Effect.fn("discover")(
			function* (_startDir) {
				const startDir = AbsolutePath.makeUnsafe(
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
					Effect.andThen(SchemaParser.decodeEffect(AbsolutePath)),
					Effect.catchIf(SchemaIssue.isIssue, Effect.die),
				);

				const rootConfig = yield* fs
					.readFileString(path.resolve(rootDir, CONTEXT0_CONFIG_FILE_NAME))
					.pipe(
						Effect.andThen((content) => Effect.sync(() => load(content))),
						Effect.andThen(SchemaParser.decodeUnknownEffect(RootConfig)),
						Effect.catchIf(SchemaIssue.isIssue, (reason) =>
							new InvalidRootConfig({
								reason,
							}).asEffect(),
						),
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
								const dirPath = AbsolutePath.makeUnsafe(
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
											SchemaParser.decodeUnknownEffect(EntrypointConfig),
										),
										Effect.catchIf(SchemaIssue.isIssue, (reason) =>
											new InvalidEntrypointConfig({
												reason,
											}).asEffect(),
										),
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
						Effect.andThen(SchemaParser.decodeUnknownEffect(Lockfile)),
						Effect.catchIf(SchemaIssue.isIssue, (reason) =>
							new InvalidLockfile({
								reason,
							}).asEffect(),
						),
					);

				return {
					_tag: "Workspace",
					entrypoints,
					lockfile,
					rootConfig,
					rootDir,
				} satisfies Workspace;
			},
			Effect.catchTags({
				PlatformError: Effect.die,
			}),
		);

		return {
			init: Effect.fn("init")(
				function* (dir) {
					const rootDir = AbsolutePath.makeUnsafe(path.resolve(dir ?? "."));

					const workspace = yield* discover(rootDir).pipe(
						Effect.map(Option.some),
						Effect.catchTags({
							RootDirNotFound: () => Effect.succeedNone,
							InvalidEntrypointConfig: Effect.die,
							InvalidLockfile: Effect.die,
							InvalidRootConfig: Effect.die,
						}),
					);
					if (workspace._tag === "Some") {
						if (workspace.value.rootDir === rootDir) return workspace.value;
						return yield* new RootDirAlreadyDefined({
							currentDir: rootDir,
							parentRootDir: workspace.value.rootDir,
						});
					}

					yield* fs.writeFileString(
						path.resolve(rootDir, CONTEXT0_LOCK_FILE_NAME),
						CONTEXT0_LOCK_FILE_DEFAULT_CONTENT,
					);

					const configFile = path.resolve(rootDir, CONTEXT0_CONFIG_FILE_NAME);
					yield* fs
						.writeFileString(
							configFile,
							CONTEXT0_ROOT_CONFIG_FILE_DEFAULT_CONTENT,
						)
						.pipe(
							Effect.when(fs.exists(configFile).pipe(Effect.map(Boolean.not))),
						);

					return yield* discover(rootDir).pipe(
						Effect.catchTags({
							RootDirNotFound: Effect.die,
							InvalidEntrypointConfig: Effect.die,
							InvalidLockfile: Effect.die,
							InvalidRootConfig: Effect.die,
						}),
					);
				},
				Effect.catchTags({
					PlatformError: Effect.die,
				}),
			),

			discover,
		};
	}),
);

/**
 * @group Layers
 */
export const live = layer;

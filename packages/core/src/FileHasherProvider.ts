import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import { pipe } from "effect/Function";
import * as HashSet from "effect/HashSet";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Stream from "effect/Stream";

import { FileHasher } from "./FileHasher.js";
import * as Hash from "./Hash.js";
import * as Lockfile from "./Lockfile.js";
import { type Scope, type WorkspacePath } from "./Models.js";
import { type Workspace } from "./Workspace.js";

/**
 * @group Layers
 */
export const layer = Layer.effect(
	FileHasher,
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const path = yield* Path.Path;

		const baseCache = new Map<string, Hash.Hash>();
		const extendedCache = new WeakMap<
			Workspace,
			Map<WorkspacePath, Hash.Hash>
		>();

		const hashFile = Effect.fnUntraced(function* (file: string) {
			const cachedHash = baseCache.get(file);
			if (cachedHash) return cachedHash;
			return yield* fs.stream(file).pipe(Stream.orDie, Hash.fromStream);
		});

		return {
			hash: Effect.fn("hash")(function* (
				workspace: Workspace,
				file: WorkspacePath,
				scope: Scope,
			) {
				const cachedHash = extendedCache.get(workspace)?.get(file);
				if (cachedHash) return cachedHash;

				const contextFiles = yield* Lockfile.fileContext(
					workspace.lockfile,
					file,
					scope,
				);

				const contextHashes = yield* Effect.forEach(
					contextFiles,
					Effect.fnUntraced(function* (contextFile) {
						const contextFileLockinfo = yield* Lockfile.fileInfo(
							workspace.lockfile,
							contextFile,
						);
						const dependencyHashes = yield* pipe(
							Lockfile.dependencyGroups(
								workspace.lockfile,
								Option.getOrThrow(contextFileLockinfo.annotations),
							),
							Array.filter(HashSet.has(file)),
							Array.flatMap(Array.fromIterable),
							Effect.forEach(
								Effect.fnUntraced(function* (depFile) {
									return yield* hashFile(
										path.resolve(workspace.rootDir, depFile.replace("/", ".")),
									);
								}),
							),
							Effect.map(Array.join(":")),
						);
						const contextBaseHash = yield* hashFile(
							path.resolve(workspace.rootDir, contextFile.replace("/", ".")),
						);
						return Hash.make(`${contextBaseHash}:${dependencyHashes}`);
					}),
				).pipe(Effect.map(Array.join(":")));

				const baseHash = yield* hashFile(
					path.resolve(workspace.rootDir, file.replace("/", ".")),
				);

				if (contextHashes.length === 0) return baseHash;
				return Hash.make(`${baseHash}:${contextHashes}`);
			}),
		};
	}),
);

/**
 * @group Layers
 */
export const live = layer;

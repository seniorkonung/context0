import * as Models from "@context0/core/Models";
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import * as Flag from "effect/unstable/cli/Flag";

/**
 * @group Flags
 */
export const NoProgressFlag = Flag.boolean("no-progress");

/**
 * @group Flags
 */
export const ProgressFlag = Flag.boolean("progress");

/**
 * @group Flags
 */
export const JsonFlag = Flag.boolean("json");

/**
 * @group Flags
 */
export const DirFlag = Flag.directory("dir", { mustExist: true }).pipe(
	Flag.withAlias("d"),
	Flag.optional,
	Flag.mapEffect(
		Effect.fnUntraced(function* (dir) {
			const path = yield* Path.Path;
			if (dir._tag === "None") return undefined;
			return Models.AbsolutePath.makeUnsafe(path.resolve(dir.value));
		}),
	),
);

/**
 * @group Flags
 */
export const FileFlag = Flag.file("file", { mustExist: true }).pipe(
	Flag.withAlias("f"),
	Flag.optional,
	Flag.mapEffect(
		Effect.fnUntraced(function* (dir) {
			const path = yield* Path.Path;
			if (dir._tag === "None") return undefined;
			return Models.AbsolutePath.makeUnsafe(path.resolve(dir.value));
		}),
	),
);

import * as Models from "@context0/core/Models";
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import * as Flag from "effect/unstable/cli/Flag";

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

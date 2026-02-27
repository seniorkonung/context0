import * as Effect from "effect/Effect";
// import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";

import { Context0, type Pattern } from "./Context0.js";

/**
 * @group Layers
 */
export const layer = Layer.effect(
	Context0,
	Effect.gen(function* () {
		// const fs = yield* FileSystem.FileSystem;
		// const root =
		return {
			changeRequiredTags: Effect.fn("changeRequiredTags")(function* () {
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
			sync: Effect.fn("sync")(function* () {
				return 1 as any;
			}),
		};
	}),
);

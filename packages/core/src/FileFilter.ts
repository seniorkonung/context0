import * as Array from "effect/Array";
import * as Boolean from "effect/Boolean";
import { pipe } from "effect/Function";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import picomatch from "picomatch";

import * as FileFilterParser from "././FileFilterParser.js";
import { type Lockfile } from "./Lockfile.js";
import { type RelativePath, type WorkspacePath } from "./Models.js";

/**
 * @group Decoding
 */
export const parse = FileFilterParser.parse;

/**
 * @group Predicates
 */
export const matches = (
	fileFilter: FileFilterParser.Stack,
	file: WorkspacePath | RelativePath,
	lockinfo: Lockfile[RelativePath],
): boolean =>
	pipe(
		fileFilter,
		Array.reduce([] as ReadonlyArray<boolean>, (state, command) => {
			return Match.value(command).pipe(
				Match.discriminators("kind")({
					TAG: ({ value }) => {
						return Array.append(state, lockinfo.tags.includes(value));
					},
					GLOB: ({ value }) => {
						return Array.append(state, picomatch(value, { dot: true })(file));
					},
					AND: () => {
						return [Boolean.ReducerAnd.combineAll(state)];
					},
					OR: () => {
						return [Boolean.ReducerOr.combineAll(state)];
					},
					NOT: () => {
						return [Boolean.not(state[0])];
					},
				}),
				Match.exhaustive,
			);
		}),
		Array.head,
		Option.getOrElse(() => false),
	);

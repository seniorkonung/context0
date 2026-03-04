import * as Array from "effect/Array";
import * as Boolean from "effect/Boolean";
import { flow } from "effect/Function";
import * as Reducer from "effect/Reducer";

/**
 * @group Reducers
 */
export const AllTrue = Boolean.ReducerAnd;

/**
 * @group Reducers
 */
export const AnyTrue = Boolean.ReducerOr;

/**
 * @group Reducers
 */
export const ExactlyOneTrue = Reducer.make<boolean>(
	Boolean.xor,
	false,
	flow(
		Array.reduce(0 as 0 | 1 | 2, (state, bool) => {
			if (!bool) return state;
			if (state === 0) return 1;
			return 2;
		}),
		(state) => state === 1,
	),
);

/**
 * @group Reducers
 */
export const NoneTrue = Reducer.make<boolean>(Boolean.nor, false);

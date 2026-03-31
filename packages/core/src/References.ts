import * as Ref from "effect/Ref";
import * as ServiceMap from "effect/ServiceMap";

/**
 * @group References
 */
export const OperationProgress = ServiceMap.Reference<{
	readonly total: Ref.Ref<number>;
	readonly current: Ref.Ref<number>;
}>("OperationProgress", {
	defaultValue: () => {
		return {
			current: Ref.makeUnsafe(0),
			total: Ref.makeUnsafe(0),
		};
	},
});

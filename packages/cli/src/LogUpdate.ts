import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ServiceMap from "effect/ServiceMap";
import { createLogUpdate } from "log-update";

/**
 * @group Services
 */
export class LogUpdate extends ServiceMap.Service<LogUpdate>()("LogUpdate", {
	make: Effect.gen(function* () {
		const logUpdate = createLogUpdate(process.stdout);
		return {
			update: (...args: Parameters<typeof logUpdate>) =>
				Effect.sync(() => logUpdate(...args)),
			clear: () => Effect.sync(() => logUpdate.clear()),
			done: () => Effect.sync(() => logUpdate.done()),
			persist: (...args: Parameters<typeof logUpdate.persist>) =>
				Effect.sync(() => logUpdate.persist(...args)),
		};
	}),
}) {
	static layer = Layer.effect(LogUpdate, LogUpdate.make);
}

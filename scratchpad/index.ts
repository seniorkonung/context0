import * as Context0 from "@context0/core/Context0";
import * as Workspace from "@context0/core/Workspace";
import * as WorkspaceServiceProvider from "@context0/core/WorkspaceServiceProvider";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";

const main = Effect.gen(function* () {
	const workspaceService = yield* Workspace.WorkspaceService;
	const workspace = yield* workspaceService.discover(
		Context0.Path.makeUnsafe("./packages/core"),
	);
	console.log(workspace);
}).pipe(
	Effect.provide([WorkspaceServiceProvider.layer]),
	Effect.provide([NodeServices.layer]),
);

NodeRuntime.runMain(main);

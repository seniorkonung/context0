#!/usr/bin/env node

import * as Context0Provider from "@context0/core/Context0Provider";
import * as WorkspaceServiceProvider from "@context0/core/WorkspaceServiceProvider";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Command from "effect/unstable/cli/Command";

import Package from "../../package.json" with { type: "json" };
import { Context0Command } from "../Commands.js";
import { LogUpdate } from "../LogUpdate.js";

const main = Command.run(Context0Command, {
	version: Package.version,
}).pipe(
	Effect.provide([
		LogUpdate.layer,
		Context0Provider.live,
		WorkspaceServiceProvider.live,
	]),
	Effect.provide([NodeServices.layer]),
);

NodeRuntime.runMain(main);

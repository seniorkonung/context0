import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as Effect from "effect/Effect";

const main = Effect.gen(function* () {});

NodeRuntime.runMain(main);

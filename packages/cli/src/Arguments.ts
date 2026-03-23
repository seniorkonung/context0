import * as Models from "@context0/core/Models";
import * as Argument from "effect/unstable/cli/Argument";

/**
 * @group Arguments
 */
export const QueryArgument = Argument.string("query").pipe(
  Argument.withSchema(Models.FileQuery),
);
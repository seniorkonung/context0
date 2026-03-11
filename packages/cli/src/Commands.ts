import * as Context0 from "@context0/core/Context0";
import * as Models from "@context0/core/Models";
import * as Workspace from "@context0/core/Workspace";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Terminal from "effect/Terminal";
import * as Argument from "effect/unstable/cli/Argument";
import * as Command from "effect/unstable/cli/Command";
import * as Flag from "effect/unstable/cli/Flag";

/**
 * @group Commands
 */
export const InitCommand = Command.make(
	"init",
	{
		dir: Flag.string("dir").pipe(Flag.withAlias("d"), Flag.optional),
	},
	Effect.fnUntraced(function* ({ dir }) {
		const path = yield* Path.Path;
		const workspaceService = yield* Workspace.WorkspaceService;
		const startDir = Models.AbsolutePath.makeUnsafe(
			path.resolve(Option.getOrElse(dir, () => ".")),
		);
		yield* workspaceService.init(startDir);
	}),
);

/**
 * @group Commands
 */
export const SyncCommand = Command.make(
	"sync",
	{},
	Effect.fnUntraced(function* () {
		const context0 = yield* Context0.Context0;
		yield* context0.sync();
	}),
);

/**
 * @group Commands
 */
export const SearchCommand = Command.make(
	"search",
	{
		query: Argument.string("query"),
		json: Flag.boolean("json"),
		cwd: Flag.boolean("cwd").pipe(Flag.withAlias("c")),
	},
	Effect.fnUntraced(function* ({ query, json, cwd }) {
		const terminal = yield* Terminal.Terminal;
		const context0 = yield* Context0.Context0;
		const files = yield* context0.search(
			Models.FileQuery.makeUnsafe(query),
			cwd ? "cwd" : "workspace",
		);

		if (json) {
			yield* terminal.display(JSON.stringify(files, null, " "));
			yield* terminal.display("\n");
			return;
		}

		yield* terminal.display(files.join("\n"));
		yield* terminal.display("\n");
	}),
);

/**
 * @group Commands
 */
export const Context0Command = Command.make("context0").pipe(
	Command.withSubcommands([InitCommand, SyncCommand, SearchCommand]),
);

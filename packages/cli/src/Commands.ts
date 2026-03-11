import * as Context0 from "@context0/core/Context0";
import * as Models from "@context0/core/Models";
import * as Workspace from "@context0/core/Workspace";
import chalk from "chalk";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import { pipe } from "effect/Function";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as String from "effect/String";
import * as Terminal from "effect/Terminal";
import * as Argument from "effect/unstable/cli/Argument";
import * as Command from "effect/unstable/cli/Command";
import * as Flag from "effect/unstable/cli/Flag";

import * as CliUi from "./CliUi.js";

/**
 * @group Flags
 */
export const JsonFlag = Flag.boolean("json");

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
		json: JsonFlag,
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
export const DescribeCommand = Command.make(
	"describe",
	{
		file: Argument.file("file", { mustExist: true }),
		json: JsonFlag,
	},
	Effect.fnUntraced(function* ({ json, file }) {
		const terminal = yield* Terminal.Terminal;
		const context0 = yield* Context0.Context0;
		const result = yield* context0.describe(
			Models.AbsolutePath.makeUnsafe(file),
		);

		if (json) {
			yield* terminal.display(JSON.stringify(result, null, " "));
			yield* terminal.display("\n");
			return;
		}

		const prettyTitle = (str: string): string => chalk.bold.white(str);
		const prettyDescription = (str: string): string =>
			chalk.white(str).replaceAll("\n", "\n\t      ");
		const prettyElement = (str: string): string => chalk.green(str);

		const tagsOutput = pipe(
			"",
			String.concat(prettyTitle("TAGS\n")),
			String.concat(
				pipe(
					result.tags,
					Array.map(
						({ name, description }) =>
							`  ${prettyElement(name)}\t      ${prettyDescription(description)}`,
					),
					Array.join("\n"),
				),
			),
			CliUi.div,
		);

		const contextOutput = pipe(
			"",
			String.concat(prettyTitle("CONTEXT\n")),
			String.concat(
				pipe(
					result.context,
					Array.map(
						({ path, description }) =>
							`  ${prettyElement(path)}\t      ${prettyDescription(description)}`,
					),
					Array.join("\n"),
				),
			),
			CliUi.div,
		);

		yield* terminal.display(tagsOutput);
		yield* terminal.display("\n\n");
		yield* terminal.display(contextOutput);
		yield* terminal.display("\n");
	}),
);

/**
 * @group Commands
 */
export const Context0Command = Command.make("context0").pipe(
	Command.withSubcommands([
		InitCommand,
		SyncCommand,
		SearchCommand,
		DescribeCommand,
	]),
);

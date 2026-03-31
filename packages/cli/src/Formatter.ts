import chalk from "chalk";
import * as Duration from "effect/Duration";
import { pipe } from "effect/Function";
import * as String from "effect/String";

import * as CliUi from "./CliUi.js";

const _title = (str: string): string => chalk.bold.white(str);
const _icon = (str: string) => chalk.yellow(str);
const _secondary = (str: string) => chalk.gray(str);
const _text = (str: string) => chalk.white(str);
const _element = (str: string) => chalk.green(str);

/**;
 * @group Utils
 */
export const table1 = (items: ReadonlyArray<string>): string => {
	const prettyCol = (str: string): string => _element(str);
	return items.map(prettyCol).join("\n");
};

/**
 * @group Utils
 */
export const table2 = (items: ReadonlyArray<[string, string]>): string => {
	const prettyCol1 = (str: string): string => _element(str);
	const prettyCol2 = (str: string): string =>
		_text(str).replaceAll("\n", "\n\t      ");
	return items
		.map(([col1, col2]) => {
			return `  ${prettyCol1(col1)}\t      ${prettyCol2(col2)}`;
		})
		.join("\n");
};

/**
 * @group Utils
 */
export const json = (value: unknown): string =>
	`${JSON.stringify(value, null, " ")}\n`;

/**
 * @group Utils
 */
export const search = (items: ReadonlyArray<string>): string =>
	`${table1(items)}\n`;

/**
 * @group Utils
 */
export const describe = (params: {
	tags: ReadonlyArray<[string, string]>;
	context: ReadonlyArray<[string, string]>;
}): string => {
	const tagsOutput = CliUi.div(`${_title("TAGS\n")}${table2(params.tags)}`);
	const contextOutput = CliUi.div(
		`${_title("CONTEXT\n")}${table2(params.context)}`,
	);
	return `${tagsOutput}\n\n${contextOutput}\n`;
};

/**
 * @group Utils
 */
export const syncProgress = (params: {
	icon: string;
	current: string;
	total: string;
}): string => {
	const delimiter = _secondary("/");
	return `${_icon(params.icon)} ${_title(params.current)}${delimiter}${_secondary(params.total)}`;
};

const _duration = (duration: Duration.Input): string => {
	const total = Math.floor(
		Duration.toSeconds(Duration.fromInputUnsafe(duration)),
	);
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const s = total % 60;
	return pipe(
		"",
		String.concat(h > 0 ? `${h}h` : ""),
		String.concat(m > 0 ? `${m}m` : ""),
		String.concat(`${s}s`),
	);
};

/**
 * @group Utils
 */
export const syncSuccess = (params: {
	current: string;
	duration: Duration.Input;
}): string =>
	`${_icon("✔")} Successfully synced ${_title(params.current)} files (${_duration(params.duration)})\n`;

import chalk from "chalk";
import * as Duration from "effect/Duration";
import { pipe } from "effect/Function";
import * as String from "effect/String";

/**
 * @group Utils
 */
export const title = (str: string): string => chalk.bold.white(str);

/**
 * @group Utils
 */
export const icon = (str: string) => chalk.yellow(str);

/**
 * @group Utils
 */
export const error = (str: string) => chalk.red(str);

/**
 * @group Utils
 */
export const warning = (str: string) => chalk.yellow(str);

/**
 * @group Utils
 */
export const secondary = (str: string) => chalk.gray(str);

/**
 * @group Utils
 */
export const text = (str: string) => chalk.white(str);

/**
 * @group Utils
 */
export const element = (str: string) => chalk.green(str);

/**;
 * @group Utils
 */
export const table1 = (items: ReadonlyArray<string>): string => {
	const prettyCol = (str: string): string => element(str);
	return items.map(prettyCol).join("\n");
};

/**
 * @group Utils
 */
export const table2 = (items: ReadonlyArray<[string, string]>): string => {
	const prettyCol1 = (str: string): string => element(str);
	const prettyCol2 = (str: string): string =>
		text(str).replaceAll("\n", "\n\t      ");
	return items
		.map(([col1, col2]) => {
			return `  ${prettyCol1(col1)}\t      ${prettyCol2(col2)}`;
		})
		.join("\n");
};

/**;
 * @group Utils
 */
export const duration = (duration: Duration.Input): string => {
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

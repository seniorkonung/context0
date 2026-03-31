import chalk from "chalk";
import * as Duration from "effect/Duration";
import { pipe } from "effect/Function";
import * as String from "effect/String";

import * as CliUi from "./CliUi.js";

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

/**
 * @group Utils
 */
export const dim = (str: string) => chalk.dim(str);

/**
 * @group Utils
 */
export const cyan = (str: string) => chalk.cyan(str);

/**
 * @group Utils
 */
export const redBright = (str: string) => chalk.redBright(str);

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
	const tagsOutput = CliUi.div(`${title("TAGS\n")}${table2(params.tags)}`);
	const contextOutput = CliUi.div(
		`${title("CONTEXT\n")}${table2(params.context)}`,
	);
	return `${tagsOutput}\n\n${contextOutput}\n`;
};

export type ReviewFeedbackLevel = "red" | "yellow" | "green" | "unknown";

export type ReviewFeedbackItem = {
	contextFile: string;
	level: ReviewFeedbackLevel;
	summary: string;
	text: string;
};

/**
 * @group Utils
 */
export const syncProgress = (params: {
	icon: string;
	current: string;
	total: string;
}): string => {
	const delimiter = secondary("/");
	return `${icon(params.icon)} ${title(params.current)}${delimiter}${secondary(params.total)}`;
};

/**
 * @group Utils
 */
export const syncSuccess = (params: {
	current: string;
	time: string;
}): string =>
	`${icon("✔")} Successfully synced ${title(params.current)} files (${params.time}s)\n`;

type ReviewPlanItem = {
	path: string;
	contextFiles: ReadonlyArray<string>;
};

const _reviewPlanSection = (
	items: ReadonlyArray<ReviewPlanItem>,
	marker: string,
): string => {
	if (items.length === 0) {
		return "";
	}

	return CliUi.div(
		table2(
			items.map(
				({ contextFiles, path }) =>
					[`${marker} ${path}`, contextFiles.join(",")] as [string, string],
			),
		),
	);
};

/**
 * @group Utils
 */
export const reviewPlan = (params: {
	pending: ReadonlyArray<ReviewPlanItem>;
	reviewedWithoutFeedback: ReadonlyArray<ReviewPlanItem>;
	reviewedWithFeedback: ReadonlyArray<ReviewPlanItem>;
}): string => {
	const sections = [
		_reviewPlanSection(params.pending, "○"),
		_reviewPlanSection(params.reviewedWithoutFeedback, "✓"),
		_reviewPlanSection(params.reviewedWithFeedback, "●"),
	].filter((section) => section.length > 0);

	if (sections.length === 0) {
		return "";
	}

	return `${sections.join("\n")}\n`;
};

const _resolveReviewFeedbackLevel = (
	feedback: ReadonlyArray<{ level: ReviewFeedbackLevel }>,
): ReviewFeedbackLevel => {
	if (feedback.some(({ level }) => level === "red")) {
		return "red";
	}
	if (feedback.some(({ level }) => level === "yellow")) {
		return "yellow";
	}
	if (feedback.some(({ level }) => level === "green")) {
		return "green";
	}
	return "unknown";
};

/**
 * @group Utils
 */
export const reviewPathLine = (params: {
	path: string;
	level: ReviewFeedbackLevel;
}): string => {
	switch (params.level) {
		case "red":
			return error(`✗ ${params.path}`);
		case "yellow":
			return warning(`⚠ ${params.path}`);
		case "green":
			return element(`✔ ${params.path}`);
		default:
			return warning(`? ${params.path}`);
	}
};

/**
 * @group Utils
 */
export const reviewFeedbackDetails = (params: {
	feedback: ReadonlyArray<ReviewFeedbackItem>;
	short: boolean;
}): string => {
	const grouped = new Map<string, Array<ReviewFeedbackItem>>();
	for (const item of params.feedback) {
		const existing = grouped.get(item.contextFile);
		if (existing) {
			existing.push(item);
		} else {
			grouped.set(item.contextFile, [item]);
		}
	}

	const entries = [...grouped.entries()];

	return entries
		.map(([contextFile, feedback], i) => {
			const isLastContextFile = feedback.length - 1 === i;
			const contextBranch = isLastContextFile ? "└──" : "├──";
			const contextHeader = (() => {
				const level = _resolveReviewFeedbackLevel(feedback);
				const prettyContextFile = cyan(contextFile);
				switch (level) {
					case "red":
						return error(`${contextBranch} ✗ ${prettyContextFile}`);
					case "yellow":
						return warning(`${contextBranch} ⚠ ${prettyContextFile}`);
					case "green":
						return element(`${contextBranch} ✔ ${prettyContextFile}`);
					default:
						return warning(`${contextBranch} ? ${prettyContextFile}`);
				}
			})();

			const feedbackBody = feedback
				.map(({ level, summary, text }, feedbackIndex) => {
					const isLastItem = params.feedback.length - 1 === feedbackIndex;
					const feedbackBranch = isLastItem ? "└──" : "├──";
					const prettySummary = redBright(summary);
					const summaryOutput = (() => {
						switch (level) {
							case "unknown":
								return warning(`    ${feedbackBranch} ? ${prettySummary}`);
							case "red":
								return error(`    ${feedbackBranch} ✗ ${prettySummary}`);
							case "green":
								return warning(`    ${feedbackBranch} ⚠ ${prettySummary}`);
							case "yellow":
								return element(`    ${feedbackBranch} ✔ ${prettySummary}`);
						}
					})();

					if (params.short) {
						return summaryOutput;
					}

					const textOutput = CliUi.div(
						`        ${text}`.replaceAll("\n", "\n        "),
					);
					return `${summaryOutput}\n${textOutput}`;
				})
				.join("\n");

			return `${contextHeader}\n${feedbackBody}`;
		})
		.join("\n");
};

const _reviewCountersOutput = (params: {
	passed: number;
	errors: number;
	warnings: number;
	unknowns: number;
}): string => {
	let output = `${element(`✔ ${params.passed} passed`)} ${error(`✗ ${params.errors} errors`)} ${warning(`⚠ ${params.warnings} warnings`)}`;
	if (params.unknowns > 0) {
		output = `${output} ${warning(`(${params.unknowns} unknowns)`)}`;
	}
	return output;
};

/**
 * @group Utils
 */
export const reviewProgress = (params: {
	icon: string;
	current: string;
	total: string;
	time: string;
	reviewFiles: ReadonlyArray<string>;
	passed: number;
	errors: number;
	warnings: number;
	unknowns: number;
}): string => {
	const reviewFilesOutput = params.reviewFiles
		.map((file) => CliUi.div(`${icon(params.icon)} ${dim(file)}`))
		.join("\n");
	const delimiter = secondary("/");
	return `\n${reviewFilesOutput}\n\n${icon(params.icon)} ${text(params.current)}${delimiter}${secondary(params.total)} (${params.time})\n${_reviewCountersOutput(params)}`;
};

/**
 * @group Utils
 */
export const reviewFinalSummary = (params: {
	current: string;
	time: string;
	passed: number;
	errors: number;
	warnings: number;
	unknowns: number;
}): string =>
	`${title(`\n${title(params.current)} files (${params.time}) `)}${_reviewCountersOutput(params)}`;

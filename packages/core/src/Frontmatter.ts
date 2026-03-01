import * as Option from "effect/Option";
import { load as parseYaml } from "js-yaml";

const PLATFORM = typeof process !== "undefined" ? process.platform : "";
const PATTERN =
	"^(" +
	"\\ufeff?" +
	"(= yaml =|---)" +
	"$([\\s\\S]*?)" +
	"^(?:\\2|\\.\\.\\.)\\s*" +
	"$" +
	(PLATFORM === "win32" ? "\\r?" : "") +
	"(?:\\n)?)";
const REGEX = new RegExp(PATTERN, "m");

/**
 * @group Methods
 */
export const load = (content: string): Option.Option<unknown> => {
	const match = REGEX.exec(content);
	if (!match) return Option.none();
	const yaml = match[match.length - 1].replace(/^\s+|\s+$/g, "");
	return Option.some(parseYaml(yaml));
};

/**
 * @group Methods
 */
export const test = (content: string): boolean => {
	return REGEX.test(content);
};

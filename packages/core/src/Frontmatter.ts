import * as Option from "effect/Option";
import { load as parseYaml } from "js-yaml";

const _PLATFORM = typeof process !== "undefined" ? process.platform : "";
const _PATTERN =
	"^(" +
	"\\ufeff?" +
	"(= yaml =|---)" +
	"$([\\s\\S]*?)" +
	"^(?:\\2|\\.\\.\\.)\\s*" +
	"$" +
	(_PLATFORM === "win32" ? "\\r?" : "") +
	"(?:\\n)?)";
const _REGEX = new RegExp(_PATTERN, "m");

/**
 * @group Constructor
 */
export const load = (content: string): Option.Option<unknown> => {
	const match = _REGEX.exec(content);
	if (!match) return Option.none();
	const yaml = match[match.length - 1].replace(/^\s+|\s+$/g, "");
	return Option.some(parseYaml(yaml));
};

/**
 * @group Predicates
 */
export const test = (content: string): boolean => {
	return _REGEX.test(content);
};

/**
 * @group Constructor
 */
export const markdown = (content: string): string => {
	return content.replace(_REGEX, "");
};

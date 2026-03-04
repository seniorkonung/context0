import yaml from "js-yaml";

class CustomDump {
	constructor(
		private readonly data: unknown,
		private readonly opts: yaml.DumpOptions,
	) {}

	represent() {
		let result = yaml.dump(
			this.data,
			Object.assign({ replacer, schema }, this.opts),
		);
		result = result.trim();
		if (result.includes("\n")) {
			result = `\n${result}`;
		}
		return result;
	}
}

const customDumpType = new yaml.Type("!format", {
	kind: "scalar",
	resolve: () => false,
	instanceOf: CustomDump,
	represent: (d: unknown) => (d as CustomDump).represent(),
});

const schema = yaml.DEFAULT_SCHEMA.extend({ implicit: [customDumpType] });

const isObject = (value: unknown): value is object =>
	typeof value === "object" && value != null;

function hasSimpleChildren(value: unknown) {
	if (isObject(value)) {
		return Object.values(value).every(
			(value) => !isObject(value) && !Array.isArray(value),
		);
	}
	if (Array.isArray(value)) {
		return value.every((value) => !isObject(value) && !Array.isArray(value));
	}
}

function replacer(key: string, value: unknown) {
	if (key === "") {
		return value;
	} // top-level, don't change this

	if (key === "fullTargets" || hasSimpleChildren(value)) {
		return new CustomDump(value, { flowLevel: 0 });
	}

	return value; // default
}

/**
 * @group Encoding
 */
export const serialize = (obj: unknown) =>
	new CustomDump(obj, { sortKeys: true }).represent().trim();

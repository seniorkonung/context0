import yaml from "js-yaml";

class _CustomDump {
	constructor(
		private readonly data: unknown,
		private readonly opts: yaml.DumpOptions,
	) {}

	represent() {
		let result = yaml.dump(
			this.data,
			Object.assign({ _replacer, _schema }, this.opts),
		);
		result = result.trim();
		if (result.includes("\n")) {
			result = `\n${result}`;
		}
		return result;
	}
}

const _customDumpType = new yaml.Type("!format", {
	kind: "scalar",
	resolve: () => false,
	instanceOf: _CustomDump,
	represent: (d: unknown) => (d as _CustomDump).represent(),
});

const _schema = yaml.DEFAULT_SCHEMA.extend({ implicit: [_customDumpType] });

const _isObject = (value: unknown): value is object =>
	typeof value === "object" && value != null;

function _hasSimpleChildren(value: unknown) {
	if (_isObject(value)) {
		return Object.values(value).every(
			(value) => !_isObject(value) && !Array.isArray(value),
		);
	}
	if (Array.isArray(value)) {
		return value.every((value) => !_isObject(value) && !Array.isArray(value));
	}
}

function _replacer(key: string, value: unknown) {
	if (key === "") {
		return value;
	} // top-level, don't change this

	if (key === "fullTargets" || _hasSimpleChildren(value)) {
		return new _CustomDump(value, { flowLevel: 0 });
	}

	return value; // default
}

/**
 * @group Encoding
 */
export const serialize = (obj: unknown): string =>
	new _CustomDump(obj, { sortKeys: true }).represent().trim();

import * as Schema from "effect/Schema";
import * as SchemaParser from "effect/SchemaParser";

import { MarkdownAnnotations } from "./MarkdownAnnotations.js";
import { Hash, RelativePath, Tag } from "./Models.js";
import * as YamlSerializer from "./YamlSerializer.js";

/**
 * @group Models
 * @group Schemas
 */
export class Lockfile extends Schema.Opaque<Lockfile>()(
	Schema.Record(
		RelativePath,
		Schema.Struct({
			requiredTags: Schema.Array(Tag),
			hash: Hash.pipe(Schema.OptionFromOptionalKey),
			tags: Schema.Array(Tag),
			annotations: MarkdownAnnotations.pipe(Schema.OptionFromOptionalKey),
		}),
	).annotate({
		identifier: "Lockfile",
	}),
) {}

/**
 * @group Encoding
 */
export const toString = (lockfile: Lockfile): string => {
	const obj = SchemaParser.encodeSync(Lockfile)(lockfile);
	return YamlSerializer.serialize(obj);
};

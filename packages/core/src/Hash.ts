import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { type ReadableStream } from "node:stream/web";

import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

/**
 * @group Schemas
 */
export const Hash = Schema.NonEmptyString.pipe(Schema.brand("Hash")).annotate({
	identifier: "Hash",
});

/**
 * @group Models
 */
export type Hash = typeof Hash.Type;

/**
 * @group Constructors
 */
export const make = (data: string): Hash => {
	return Hash.makeUnsafe(createHash("sha256").update(data).digest("hex"));
};

/**
 * @group Constructors
 */
export const fromStream = (stream: Stream.Stream<Uint8Array>) =>
	Effect.promise(async () => {
		const hash = createHash("sha256");
		const webStream = Stream.toReadableStream(stream);
		const nodeStream = Readable.fromWeb(webStream as unknown as ReadableStream);
		await pipeline(nodeStream, hash);
		return Hash.makeUnsafe(hash.digest("hex"));
	});

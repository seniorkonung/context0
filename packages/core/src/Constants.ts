import { dump } from "js-yaml";

import { type Lockfile } from "./Lockfile.js";
import { type RootConfig } from "./Models.js";

/**
 * @group Constants
 */
export const CONTEXT0_LOCK_FILE_NAME = "context0.lock.yaml";

/**
 * @group Constants
 */
export const CONTEXT0_CONFIG_FILE_NAME = "context0.yaml";

/**
 * @group Constants
 */
export const CONTEXT0_FOLDER_NAME = ".context0";

/**
 * @group Constants
 */
export const CONTEXT0_LOCK_FILE_DEFAULT_CONTENT = dump({
	[CONTEXT0_LOCK_FILE_NAME as string]: { tags: [] },
	[CONTEXT0_CONFIG_FILE_NAME as string]: { tags: [] },
} satisfies typeof Lockfile.Encoded);

/**
 * @group Constants
 */
export const CONTEXT0_ROOT_CONFIG_FILE_DEFAULT_CONTENT = dump({
	ignore: [".git"],
} satisfies typeof RootConfig.Encoded);

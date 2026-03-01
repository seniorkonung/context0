import { dump } from "js-yaml";

import { type Lockfile, type RootConfig } from "./Models.js";

export const CONTEXT0_LOCK_FILE_NAME = "context0.lock.yaml";
export const CONTEXT0_CONFIG_FILE_NAME = "context0.yaml";
export const CONTEXT0_FOLDER_NAME = ".context0";

export const CONTEXT0_LOCK_FILE_DEFAULT_CONTENT = dump({
	[CONTEXT0_LOCK_FILE_NAME as string]: { requiredTags: [], tags: [] },
	[CONTEXT0_CONFIG_FILE_NAME as string]: { requiredTags: [], tags: [] },
} satisfies typeof Lockfile.Encoded);

export const CONTEXT0_ROOT_CONFIG_FILE_DEFAULT_CONTENT = dump({
	ignore: [".git"],
} satisfies typeof RootConfig.Encoded);

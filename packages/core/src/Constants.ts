import { dump } from "js-yaml";

import {
	FEEDBACK_ITEM_SEPARATOR,
	FEEDBACK_SECTION_SEPARATOR,
} from "./Feedback.js";
import { type Lockfile } from "./Lockfile.js";
import { type CliAgent, type RootConfig } from "./Models.js";

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
export const CONTEXT0_CACHE_DIRECTORY = ".context0/.cache";

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

/**
 * @group Constants
 */
export const CONTEXT0_DEFAULT_CLI_AGENTS: ReadonlyArray<CliAgent> = [
	"claude",
] as ReadonlyArray<CliAgent>;

/**
 * @group Constants
 */
export const REVIEW_CONTEXT_FILE_PLACEHOLDERS = {
	RELATIVE_PATH: "$RELATIVE_PATH",
	DESCRIPTION: "$DESCRIPTION",
};

/**
 * @group Constants
 */
export const REVIEW_CONTEXT_FILE_TEMPLATE = `
<context_file>
	<path>${REVIEW_CONTEXT_FILE_PLACEHOLDERS.RELATIVE_PATH}</path>
	<description>${REVIEW_CONTEXT_FILE_PLACEHOLDERS.DESCRIPTION}</description>
</context_file>
`;

/**
 * @group Constants
 */
export const REVIEW_PROMPT_PLACEHOLDERS = {
	TARGET_FILE_PATH: "$TARGET_FILE_PATH",
	TARGET_FILE_DESCRIPTION: "$TARGET_FILE_DESCRIPTION",
	CONTEXT_FILES: "$CONTEXT_FILES",
};

/**
 * @group Constants
 */
export const REVIEW_PROMPT = `
You are performing a review of a file strictly based on the provided context files.

<context_files>
  ${REVIEW_PROMPT_PLACEHOLDERS.CONTEXT_FILES}
</context_files>

<file_under_review>
  <path>${REVIEW_PROMPT_PLACEHOLDERS.TARGET_FILE_PATH}</path>
  <description>${REVIEW_PROMPT_PLACEHOLDERS.TARGET_FILE_DESCRIPTION}</description>
</file_under_review>

<instructions>
Follow these steps in order:

1. Read all context files. As you read each one, follow any relative links or
   references to other files that are relevant — read those too.

2. Read the file under review.

3. Use the descriptions to understand the role each context file plays.

4. Before outputting feedback blocks, mentally consolidate your findings.
   If multiple observations point to the same underlying issue, merge them
   into a single feedback block. Do not produce two blocks that describe
   the same problem, even if they reference different lines or slightly
   different symptoms of the same root cause.

5. Produce feedback blocks — one per distinct finding. Produce as many blocks as
   you have grounded findings for. Do not produce any output outside of feedback
   blocks.

Your review must be grounded exclusively in the context files. Do not raise any
issue, suggestion, or observation that cannot be traced back to a specific context
file. Every feedback block must cite the context file it originates from.

The language of each feedback block must match the language of the context file
it is based on. If a context file is in Russian, write that feedback in Russian.
If a context file is in English, write that feedback in English.

The order of feedback blocks does not matter.
</instructions>

<output_format>
Each feedback block must follow this exact structure:

${FEEDBACK_ITEM_SEPARATOR}
LEVEL=<red|yellow|green>
CONTEXT_FILE=<relative path to the context file this feedback is based on>
SUMMARY=<one-line summary, max 80 characters, no line breaks>
${FEEDBACK_SECTION_SEPARATOR}
<feedback text>

Attribute rules:
- LEVEL accepts exactly three values: red, yellow, green. No other values are allowed.
    red    — a serious violation or mismatch. Must be fixed.
    yellow — not an error, but requires attention. A warning.
    green  — informational. Neither a warning nor an error.
- CONTEXT_FILE must always point to the specific context file this feedback is
  based on.
- SUMMARY must be a single line, no longer than 80 characters, with no line breaks.
- No attribute value may contain a line break. Each line break signals a new attribute.
- All three attributes are required in every block, in the order shown above.
- Each separator line must start on its own line and contain no other characters.

Feedback text rules:
- Begin immediately after the closing separator line (${FEEDBACK_SECTION_SEPARATOR}).
- Be specific: reference concrete sections, lines, or passages from the file under review.
- Cite the relevant part of the context file that grounds this finding.
- Each block must describe a distinct finding. Do not repeat or rephrase
  a finding already covered in a previous block.
- Continue until the next opening separator line (${FEEDBACK_ITEM_SEPARATOR}).

Example of a valid feedback block:

${FEEDBACK_ITEM_SEPARATOR}
LEVEL=red
CONTEXT_FILE=docs/requirements/tone-of-voice.md
SUMMARY=Article opening does not match the tone of voice requirements
${FEEDBACK_SECTION_SEPARATOR}
According to \`tone-of-voice.md\` (section "Opening Paragraph"), articles must
open with a concrete user problem statement. The file under review opens with
a general market overview instead, which contradicts this requirement.

</output_format>

Now perform the review.
`;

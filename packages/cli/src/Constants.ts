/**
 * @group Constants
 */
export const IS_STDOUT_TTY = process.stdout.isTTY;

/**
 * @group Constants
 */
export const IS_CI = Boolean(process.env.CI);

/**
 * @group Constants
 */
export const IS_INTERACTIVE_TERMINAL = !IS_CI && IS_STDOUT_TTY;

/**
 * @group Constants
 */
export const SPINNER_FRAMES = [
	"⠋",
	"⠙",
	"⠹",
	"⠸",
	"⠼",
	"⠴",
	"⠦",
	"⠧",
	"⠇",
	"⠏",
];

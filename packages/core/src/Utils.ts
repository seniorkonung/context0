/**
 * @group Functions
 */
export const startsWithUnescaped = (str: string, char: string): boolean => {
	let escaped = false;

	for (let i = 0; i < str.length; i++) {
		const c = str[i];

		if (escaped) {
			escaped = false;
			continue;
		}

		if (c === "\\") {
			escaped = true;
			continue;
		}

		return c === char;
	}

	return false;
};

/**
 * @group Functions
 */
export const withTrailingSlash = (s: string) => {
	return s.length === 0 ? s : s.endsWith("/") ? s : `${s}/`;
};

/**
 * @group Utils
 */
export const withTrailingSlash = (s: string) => {
	return s.length === 0 ? s : s.endsWith("/") ? s : `${s}/`;
};

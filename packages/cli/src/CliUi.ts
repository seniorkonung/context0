// @ts-expect-error
import cliui from "cliui";

/**
 * @group Methods
 */
export const div = (dsl: string): string => {
	const ui = cliui({
		width: 120,
	});
	ui.div(dsl);
	return ui.toString();
};

#!/usr/bin/env zx

//MISE hide=true

import { getCommitedPackages } from "./utils.js";

const packages = await getCommitedPackages(["*.ts", "*.tsx"]);
const pwd = await $`pwd`.text().then((s) => s.trim());

for (const { packageName } of packages) {
	const command = `//packages/${packageName}:test`;
	await cd(`${pwd}/packages/${packageName}`);
	const tasksStr = await $`mise tasks`.text();
	if (tasksStr.includes(command)) {
		$`mise run ${command}`.catch(() => {
			throw `${chalk.red("ERROR:")} test error for package "${packageName}"`;
		});
	}
}

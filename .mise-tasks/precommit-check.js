#!/usr/bin/env zx

//MISE hide=true

import { getStagedPackages } from "./utils.js";

const packages = await getStagedPackages(["*.ts", "*.tsx"]);
const pwd = await $`pwd`.text().then((s) => s.trim());

for (const { packageName } of packages) {
	const command = `//packages/${packageName}:check`;
	await cd(`${pwd}/packages/${packageName}`);
	const tasksStr = await $`mise tasks`.text();
	if (tasksStr.includes(command)) {
		$`mise run ${command}`.catch(() => {
			throw `${chalk.red("ERROR:")} type checking failed for package "${packageName}"`;
		});
	}
}

#!/usr/bin/env zx

const targets = ["node_modules", ".tsbuildinfo", "build", "dist"];

for (const target of targets) {
	await $`find . -name ${target} -prune -exec rm -rf {} +`;
}

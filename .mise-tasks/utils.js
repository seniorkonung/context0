export async function getStagedFiles(globs) {
	return await $`git --no-pager diff --staged --diff-filter=d --name-only -- ${globs}`.then(
		({ stdout }) => {
			return stdout
				.split("\n")
				.map((s) => s.trim())
				.filter((s) => s.length > 0);
		},
	);
}

export async function getStagedPackages(globs) {
	const stagedFiles = await getStagedFiles(globs);
	return stagedFiles.reduce((stagedPackages, filePath) => {
		if (!filePath.startsWith("packages/")) return stagedPackages;
		const [_, packageName] = filePath.split("/");
		const stagedPackage = stagedPackages.find(
			(item) => item.packageName === packageName,
		) ?? {
			files: [],
			packageName,
		};
		return [
			...stagedPackages.filter((item) => item.packageName !== packageName),
			{
				files: [...stagedPackage.files, filePath],
				packageName: stagedPackage.packageName,
			},
		];
	}, []);
}

export async function getCommitedFiles(globs) {
	return await $`git --no-pager diff --diff-filter=d --name-only origin/main..HEAD -- ${globs}`.then(
		({ stdout }) => {
			return stdout
				.split("\n")
				.map((s) => s.trim())
				.filter((s) => s.length > 0);
		},
	);
}

export async function getCommitedPackages(globs) {
	const commitedFiles = await getCommitedFiles(globs);
	return commitedFiles.reduce((commitedPackages, filePath) => {
		if (!filePath.startsWith("packages/")) return commitedPackages;
		const [_, packageName] = filePath.split("/");
		const commitedPackage = commitedPackages.find(
			(item) => item.packageName === packageName,
		) ?? {
			files: [],
			packageName,
		};
		return [
			...commitedPackages.filter((item) => item.packageName !== packageName),
			{
				files: [...commitedPackage.files, filePath],
				packageName: commitedPackage.packageName,
			},
		];
	}, []);
}

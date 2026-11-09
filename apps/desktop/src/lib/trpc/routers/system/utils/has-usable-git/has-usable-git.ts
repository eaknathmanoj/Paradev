import { join } from "node:path";

export interface HasUsableGitDeps {
	platform: NodeJS.Platform;
	/** Resolves with stdout; rejects when the command fails. */
	run: (command: string, args: string[]) => Promise<string>;
	fileExists: (path: string) => boolean;
}

const APPLE_GIT_STUB_PATH = "/usr/bin/git";

/**
 * Never runs git: on a Mac without Command Line Tools, `/usr/bin/git` is a
 * stub that opens Apple's install dialog.
 */
export async function hasUsableGit({
	platform,
	run,
	fileExists,
}: HasUsableGitDeps): Promise<boolean> {
	if (platform !== "darwin") return true;
	const gitPath = await run("/usr/bin/which", ["git"]).then(
		(stdout) => stdout.trim() || null,
		() => null,
	);
	if (gitPath && gitPath !== APPLE_GIT_STUB_PATH) return true;
	const developerDir = await run("/usr/bin/xcode-select", ["-p"]).then(
		(stdout) => stdout.trim() || null,
		() => null,
	);
	return (
		developerDir !== null && fileExists(join(developerDir, "usr", "bin", "git"))
	);
}

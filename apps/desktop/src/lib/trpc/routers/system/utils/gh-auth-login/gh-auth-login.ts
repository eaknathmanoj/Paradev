import { parseGhDeviceCode } from "../parse-gh-device-code";

export type GhAuthLoginEvent =
	| { type: "code"; code: string; url: string }
	| { type: "done" }
	| { type: "failed" };

export interface GhProcess {
	onOutput: (listener: (chunk: string) => void) => void;
	exited: Promise<number | null>;
	kill: () => void;
}

export interface GhAuthLoginDeps {
	hasUsableGit: () => Promise<boolean>;
	runGh: (args: string[]) => Promise<void>;
	spawnGh: (args: string[]) => GhProcess;
	isGitSetupPending: () => Promise<boolean>;
	setGitSetupPending: (pending: boolean) => Promise<void>;
}

const LOGIN_BASE_ARGS = ["auth", "login", "--hostname", "github.com", "--web"];
const SETUP_GIT_ARGS = ["auth", "setup-git", "--hostname", "github.com"];

/**
 * With `--git-protocol https`, gh runs git to set up its credential helper.
 * Without usable git, sign in as ssh (which runs no git) and switch gh back
 * to https right after.
 */
export function ghLoginArgs(gitUsable: boolean): string[] {
	return gitUsable
		? [...LOGIN_BASE_ARGS, "--git-protocol", "https", "--skip-ssh-key"]
		: [...LOGIN_BASE_ARGS, "--git-protocol", "ssh", "--skip-ssh-key"];
}

export function runGhAuthLogin(
	onEvent: (event: GhAuthLoginEvent) => void,
	deps: GhAuthLoginDeps,
): () => void {
	let stopped = false;
	let child: GhProcess | null = null;
	const emit = (event: GhAuthLoginEvent) => {
		if (!stopped) onEvent(event);
	};

	void (async () => {
		const gitUsable = await deps.hasUsableGit();
		if (stopped) return;
		child = deps.spawnGh(ghLoginArgs(gitUsable));
		let output = "";
		let sentCode = false;
		child.onOutput((chunk) => {
			if (sentCode) return;
			output = (output + chunk).slice(-4096);
			const parsed = parseGhDeviceCode(output);
			if (parsed) {
				sentCode = true;
				emit({ type: "code", ...parsed });
			}
		});
		const exitCode = await child.exited;
		if (stopped) return;
		if (exitCode !== 0) {
			emit({ type: "failed" });
			return;
		}
		if (gitUsable) {
			await deps.runGh(SETUP_GIT_ARGS).catch(() => {});
		} else {
			await deps
				.runGh(["config", "set", "-h", "github.com", "git_protocol", "https"])
				.catch(() => {});
			await deps.setGitSetupPending(true).catch(() => {});
		}
		emit({ type: "done" });
	})().catch(() => emit({ type: "failed" }));

	return () => {
		stopped = true;
		child?.kill();
	};
}

/** Sets up gh as git's credential helper once git works, after a git-free sign-in. */
export async function finishPendingGitSetup(
	deps: Pick<
		GhAuthLoginDeps,
		"hasUsableGit" | "runGh" | "isGitSetupPending" | "setGitSetupPending"
	>,
): Promise<boolean> {
	if (!(await deps.isGitSetupPending())) return false;
	if (!(await deps.hasUsableGit())) return false;
	try {
		await deps.runGh(SETUP_GIT_ARGS);
	} catch {
		return false;
	}
	await deps.setGitSetupPending(false);
	return true;
}

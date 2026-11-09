import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { withBinDirOnPath } from "@superset/agent-setup/paths";
import { getProcessEnvWithShellEnv } from "../../../workspaces/utils/shell-env";
import { parseGhDeviceCode } from "../parse-gh-device-code";

const execFileAsync = promisify(execFile);

const GH_LOGIN_ARGS = [
	"auth",
	"login",
	"--hostname",
	"github.com",
	"--git-protocol",
	"https",
	"--web",
	"--skip-ssh-key",
];

export type GhAuthLoginEvent =
	| { type: "code"; code: string; url: string }
	| { type: "done" }
	| { type: "failed" };

/** Without Command Line Tools, `/usr/bin/git` opens Apple's install dialog. */
async function gitIsUsable(env: Record<string, string>): Promise<boolean> {
	if (process.platform !== "darwin") return true;
	try {
		await execFileAsync("/usr/bin/xcode-select", ["-p"], { env });
		return true;
	} catch {
		return false;
	}
}

/**
 * Runs gh's device flow without a TTY, so gh asks nothing. The git credential
 * answer the interactive flow asks for ("Y") is applied after sign-in.
 */
export function runGhAuthLogin(
	onEvent: (event: GhAuthLoginEvent) => void,
): () => void {
	let stopped = false;
	let child: ReturnType<typeof spawn> | null = null;

	void (async () => {
		const env = withBinDirOnPath(await getProcessEnvWithShellEnv());
		if (stopped) return;
		child = spawn("gh", GH_LOGIN_ARGS, {
			env,
			stdio: ["ignore", "pipe", "pipe"],
		});
		let output = "";
		let sentCode = false;
		const onData = (chunk: Buffer) => {
			if (sentCode) return;
			output = (output + chunk.toString("utf8")).slice(-4096);
			const parsed = parseGhDeviceCode(output);
			if (parsed) {
				sentCode = true;
				onEvent({ type: "code", ...parsed });
			}
		};
		child.stdout?.on("data", onData);
		child.stderr?.on("data", onData);
		child.on("error", () => {
			if (!stopped) onEvent({ type: "failed" });
		});
		child.on("close", async (exitCode) => {
			if (stopped) return;
			if (exitCode !== 0) {
				onEvent({ type: "failed" });
				return;
			}
			if (await gitIsUsable(env)) {
				await execFileAsync(
					"gh",
					["auth", "setup-git", "--hostname", "github.com"],
					{ env, timeout: 15_000 },
				).catch(() => {});
			}
			if (!stopped) onEvent({ type: "done" });
		});
	})().catch(() => {
		if (!stopped) onEvent({ type: "failed" });
	});

	return () => {
		stopped = true;
		child?.kill();
	};
}

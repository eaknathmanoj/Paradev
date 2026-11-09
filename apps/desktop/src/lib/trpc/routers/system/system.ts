import { getBinDir } from "@superset/agent-setup/paths";
import { observable } from "@trpc/server/observable";
import { net } from "electron";
import { publicProcedure, router } from "../..";
import { execWithShellEnv } from "../workspaces/utils/shell-env";
import {
	createGhCliDeps,
	finishPendingGhGitSetup,
	type GhAuthLoginEvent,
	runGhAuthLogin,
} from "./utils/gh-auth-login";
import { type GhInstallEvent, installGhCli } from "./utils/install-gh-cli";

interface GhDetectResult {
	installed: boolean;
	authenticated: boolean;
	version: string | null;
	path: string | null;
}

async function detectGhCli(): Promise<GhDetectResult> {
	// Resolve `gh` via the user's login-shell PATH (execWithShellEnv retries with
	// the derived shell env on ENOENT), so we find it wherever it's installed —
	// homebrew, MacPorts, nix, asdf, etc. — not just a hardcoded path list.
	let version: string | null = null;
	try {
		const { stdout } = await execWithShellEnv("gh", ["--version"], {
			timeout: 5000,
		});
		const firstLine = stdout.split("\n")[0]?.trim() ?? "";
		version = firstLine.match(/gh version (\S+)/)?.[1] ?? null;
	} catch {
		return {
			installed: false,
			authenticated: false,
			version: null,
			path: null,
		};
	}

	let authenticated = false;
	try {
		await execWithShellEnv(
			"gh",
			["auth", "status", "--active", "--hostname", "github.com"],
			{ timeout: 5000 },
		);
		authenticated = true;
	} catch {
		// `--active` requires gh >= 2.40; retry without it for older installs.
		// Both variants exit non-zero when not logged in.
		try {
			await execWithShellEnv(
				"gh",
				["auth", "status", "--hostname", "github.com"],
				{ timeout: 5000 },
			);
			authenticated = true;
		} catch {}
	}

	if (authenticated) void finishPendingGhGitSetup();
	return { installed: true, authenticated, version, path: "gh" };
}

interface BrewDetectResult {
	installed: boolean;
	version: string | null;
}

async function detectBrew(): Promise<BrewDetectResult> {
	try {
		const { stdout } = await execWithShellEnv("brew", ["--version"], {
			timeout: 5000,
		});
		const version = stdout.match(/Homebrew (\S+)/)?.[1] ?? null;
		return { installed: true, version };
	} catch {
		return { installed: false, version: null };
	}
}

async function installGhWithBrew(): Promise<GhInstallEvent> {
	try {
		await execWithShellEnv("brew", ["install", "gh"], { timeout: 600_000 });
		const { version } = await detectGhCli();
		return { stage: "done", version: version ?? "" };
	} catch {
		return { stage: "failed", reason: "install" };
	}
}

export const createSystemRouter = () => {
	return router({
		detectGhCli: publicProcedure.query(detectGhCli),
		detectBrew: publicProcedure.query(detectBrew),
		installGhCli: publicProcedure.subscription(() => {
			return observable<GhInstallEvent>((emit) => {
				const controller = new AbortController();
				const finish = (event: GhInstallEvent) => {
					if (controller.signal.aborted) return;
					emit.next(event);
					emit.complete();
				};
				if (process.platform === "darwin") {
					void installGhCli({
						binDir: getBinDir(),
						fetch: (url, init) => net.fetch(url, init),
						signal: controller.signal,
						onProgress: (event) => {
							if (event.stage === "done" || event.stage === "failed") return;
							if (!controller.signal.aborted) emit.next(event);
						},
					}).then(finish);
				} else {
					emit.next({ stage: "installing" });
					void installGhWithBrew().then(finish);
				}
				return () => controller.abort();
			});
		}),
		ghAuthLogin: publicProcedure.subscription(() => {
			return observable<GhAuthLoginEvent>((emit) =>
				runGhAuthLogin((event) => {
					emit.next(event);
					if (event.type !== "code") emit.complete();
				}, createGhCliDeps()),
			);
		}),
	});
};

export type SystemRouter = ReturnType<typeof createSystemRouter>;

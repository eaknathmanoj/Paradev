import { describe, expect, test } from "bun:test";
import { hasUsableGit } from "../has-usable-git";
import {
	finishPendingGitSetup,
	type GhAuthLoginDeps,
	type GhAuthLoginEvent,
	runGhAuthLogin,
} from "./gh-auth-login";

function fakeDeps(gitUsable: boolean) {
	const ghCalls: string[][] = [];
	const state = {
		pending: false,
		loginArgs: [] as string[],
		loginPath: "",
	};
	const deps: GhAuthLoginDeps = {
		hasUsableGit: async () => gitUsable,
		toolEnv: async () => ({ PATH: "/opt/homebrew/bin:/usr/bin:/bin" }),
		gitShimDir: async () => "/app-home/gh-git-shim",
		runGh: async (args) => {
			ghCalls.push(args);
		},
		spawnGh: (args, env) => {
			state.loginArgs = args;
			state.loginPath = env.PATH ?? "";
			let emitOutput: (chunk: string) => void = () => {};
			return {
				onOutput: (listener) => {
					emitOutput = listener;
					queueMicrotask(() =>
						emitOutput("! One-time code (AB12-CD34) copied to clipboard\n"),
					);
				},
				exited: new Promise((resolve) => setTimeout(() => resolve(0), 1)),
				kill: () => {},
			};
		},
		isGitSetupPending: async () => state.pending,
		setGitSetupPending: async (pending) => {
			state.pending = pending;
		},
	};
	return { deps, ghCalls, state };
}

function signIn(deps: GhAuthLoginDeps) {
	return new Promise<GhAuthLoginEvent[]>((resolve) => {
		const events: GhAuthLoginEvent[] = [];
		runGhAuthLogin((event) => {
			events.push(event);
			if (event.type !== "code") resolve(events);
		}, deps);
	});
}

describe("gh sign-in", () => {
	test("with usable git, signs in over https and sets up git credentials", async () => {
		const { deps, ghCalls, state } = fakeDeps(true);
		const events = await signIn(deps);

		expect(events.map((event) => event.type)).toEqual(["code", "done"]);
		expect(state.loginArgs).toContain("https");
		expect(state.loginPath).toBe("/opt/homebrew/bin:/usr/bin:/bin");
		expect(ghCalls).toEqual([
			["auth", "setup-git", "--hostname", "github.com"],
		]);
		expect(state.pending).toBe(false);
	});

	test("without usable git, signs in without git and sets up credentials once git works", async () => {
		const { deps, ghCalls, state } = fakeDeps(false);
		const events = await signIn(deps);

		expect(events.map((event) => event.type)).toEqual(["code", "done"]);
		expect(state.loginArgs).toContain("ssh");
		expect(state.loginArgs).toContain("--skip-ssh-key");
		expect(state.loginPath).toBe(
			"/app-home/gh-git-shim:/opt/homebrew/bin:/usr/bin:/bin",
		);
		expect(ghCalls).toEqual([
			["config", "set", "-h", "github.com", "git_protocol", "https"],
		]);
		expect(state.pending).toBe(true);

		expect(await finishPendingGitSetup(deps)).toBe(false);
		expect(ghCalls).toHaveLength(1);

		deps.hasUsableGit = async () => true;
		expect(await finishPendingGitSetup(deps)).toBe(true);
		expect(ghCalls.at(-1)).toEqual([
			"auth",
			"setup-git",
			"--hostname",
			"github.com",
		]);
		expect(state.pending).toBe(false);
	});

	test("git detection never runs the Apple git stub", async () => {
		const ran: string[] = [];
		const usable = await hasUsableGit({
			platform: "darwin",
			run: async (command, args) => {
				ran.push([command, ...args].join(" "));
				if (command === "/usr/bin/which") return "/usr/bin/git\n";
				throw new Error(
					"xcode-select: error: unable to get active developer directory",
				);
			},
			fileExists: () => false,
		});
		expect(usable).toBe(false);
		expect(ran.some((command) => command.startsWith("git"))).toBe(false);
	});
});

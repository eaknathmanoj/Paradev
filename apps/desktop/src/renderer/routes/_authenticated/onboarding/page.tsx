import { useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { SiGithub } from "react-icons/si";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	GitHubCliDialog,
	type GitHubCliDialogStart,
} from "renderer/routes/_authenticated/components/GitHubCliDialog";
import { OnboardingTile } from "./components/OnboardingTile";

export const Route = createFileRoute("/_authenticated/onboarding/")({
	component: OnboardingDashboardPage,
});

const PREREQ_POLL_MS = 4000;
const GH_CLI_HOME_URL = "https://cli.github.com/";
const isMac = navigator.platform.toUpperCase().includes("MAC");

function OnboardingDashboardPage() {
	const { t } = useLingui();
	const [ghDialogStart, setGhDialogStart] =
		useState<GitHubCliDialogStart | null>(null);

	// Polls even while the window is unfocused, so a gh installed or signed in
	// from a terminal shows up without switching back to the app.
	const { data: ghStatus, isPending: isPendingGh } =
		electronTrpc.system.detectGhCli.useQuery(undefined, {
			refetchInterval: PREREQ_POLL_MS,
			refetchIntervalInBackground: true,
		});
	const { data: brewStatus } = electronTrpc.system.detectBrew.useQuery(
		undefined,
		{ enabled: !isMac },
	);

	const ghInstalled = ghStatus?.installed === true;
	const ghReady = ghInstalled && ghStatus?.authenticated === true;

	const ghStatusLabel = ghReady
		? t`Connected`
		: ghInstalled
			? t`Not signed in`
			: t`Not installed`;

	const openGitHubInstall = () => {
		if (isMac || brewStatus?.installed === true) {
			setGhDialogStart("install");
			return;
		}
		window.open(GH_CLI_HOME_URL, "_blank", "noopener,noreferrer");
	};

	const statusDot = (
		<span
			className={cn(
				"size-1.5 rounded-full",
				ghReady
					? "bg-emerald-500"
					: ghInstalled
						? "bg-amber-500"
						: "bg-muted-foreground/40",
			)}
		/>
	);

	return (
		<>
			<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
				<OnboardingTile
					icon={<SiGithub />}
					label={
						ghReady
							? "GitHub CLI"
							: ghInstalled
								? t`Sign in to GitHub`
								: t`Install GitHub CLI`
					}
					status={
						isPendingGh ? (
							t`Checking…`
						) : (
							<>
								{statusDot}
								{ghStatusLabel}
							</>
						)
					}
					onClick={
						ghReady
							? () => {}
							: ghInstalled
								? () => setGhDialogStart("auth")
								: openGitHubInstall
					}
					disabled={isPendingGh}
				/>
			</div>

			<GitHubCliDialog
				open={ghDialogStart !== null}
				startWith={ghDialogStart ?? "auth"}
				onOpenChange={(open) => {
					if (!open) setGhDialogStart(null);
				}}
			/>
		</>
	);
}

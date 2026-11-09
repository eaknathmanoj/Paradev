import { Trans, useLingui } from "@lingui/react/macro";
import { formatPercent } from "@superset/i18n/format";
import { Button } from "@superset/ui/button";
import { Progress } from "@superset/ui/progress";
import { Spinner } from "@superset/ui/spinner";
import { useState } from "react";
import { LuArrowUpRight } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { StepError } from "../StepError";

const GH_CLI_HOME_URL = "https://cli.github.com/";
const GH_CLI_RELEASES_URL = "https://github.com/cli/cli/releases/latest";
const isMac = navigator.platform.toUpperCase().includes("MAC");

type InstallState =
	| { stage: "starting" }
	| { stage: "downloading"; fraction: number | null }
	| { stage: "verifying" | "installing" }
	| { stage: "failed"; reason: "download" | "checksum" | "install" };

interface InstallStepProps {
	onInstalled: () => void;
	onRetry: () => void;
}

export function InstallStep({ onInstalled, onRetry }: InstallStepProps) {
	const { t } = useLingui();
	const [state, setState] = useState<InstallState>({ stage: "starting" });

	electronTrpc.system.installGhCli.useSubscription(undefined, {
		onData: (event) => {
			if (event.stage === "done") {
				onInstalled();
			} else if (event.stage === "downloading") {
				setState({
					stage: "downloading",
					fraction: event.totalBytes
						? Math.min(event.receivedBytes / event.totalBytes, 1)
						: null,
				});
			} else {
				setState(event);
			}
		},
		onError: () => setState({ stage: "failed", reason: "install" }),
	});

	if (state.stage === "failed") {
		const message =
			state.reason === "download"
				? t`Couldn't download GitHub CLI. Check your internet connection and try again.`
				: state.reason === "checksum"
					? t`The download didn't match GitHub's checksum, so it wasn't installed. Try again.`
					: t`Couldn't install GitHub CLI.`;
		return (
			<StepError
				message={message}
				onRetry={onRetry}
				fallback={
					<Button
						type="button"
						size="sm"
						variant="ghost"
						onClick={() =>
							window.open(
								isMac ? GH_CLI_RELEASES_URL : GH_CLI_HOME_URL,
								"_blank",
								"noopener,noreferrer",
							)
						}
					>
						<Trans>Open the download page</Trans>
						<LuArrowUpRight className="size-3" />
					</Button>
				}
			/>
		);
	}

	const label =
		state.stage === "verifying"
			? t`Checking the download…`
			: state.stage === "installing"
				? t`Installing…`
				: t`Downloading GitHub CLI…`;
	const fraction = state.stage === "downloading" ? state.fraction : null;

	return (
		<div className="flex flex-col gap-3 py-2">
			<div className="flex items-center gap-2.5 text-sm text-muted-foreground">
				<Spinner className="size-3.5 shrink-0" />
				<span>{label}</span>
				{fraction !== null && (
					<span className="ml-auto tabular-nums">
						{formatPercent(fraction, { maximumFractionDigits: 0 })}
					</span>
				)}
			</div>
			<Progress
				value={
					fraction !== null
						? fraction * 100
						: state.stage === "starting"
							? 0
							: 100
				}
			/>
		</div>
	);
}

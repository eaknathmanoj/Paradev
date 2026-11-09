import { Trans } from "@lingui/react/macro";
import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import { useState } from "react";

interface GitHubStepContinueProps {
	ghReady: boolean;
	onContinue: () => void;
}

export function GitHubStepContinue({
	ghReady,
	onContinue,
}: GitHubStepContinueProps) {
	const [confirmOpen, setConfirmOpen] = useState(false);

	if (ghReady) {
		return (
			<Button size="sm" onClick={onContinue}>
				<Trans>Continue</Trans>
			</Button>
		);
	}

	return (
		<>
			<Button size="sm" onClick={() => setConfirmOpen(true)}>
				<Trans>Skip for now</Trans>
			</Button>
			<AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
				<AlertDialogContent className="sm:max-w-[400px]">
					<AlertDialogHeader>
						<AlertDialogTitle>
							<Trans>Skip GitHub for now?</Trans>
						</AlertDialogTitle>
						<AlertDialogDescription>
							<Trans>
								You can still clone public repos. Private repos and pull
								requests need GitHub connected. You can connect it later in
								Settings.
							</Trans>
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<Button variant="outline" onClick={() => setConfirmOpen(false)}>
							<Trans>Go back</Trans>
						</Button>
						<Button
							onClick={() => {
								setConfirmOpen(false);
								onContinue();
							}}
						>
							<Trans>Skip</Trans>
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}

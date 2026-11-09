import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { GitHubStepContinue } from "./GitHubStepContinue";

afterEach(cleanup);

describe("GitHubStepContinue", () => {
	test("skipping asks first, continuing once connected does not", () => {
		const onContinue = mock(() => {});
		const view = render(
			<GitHubStepContinue ghReady={false} onContinue={onContinue} />,
		);

		fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
		expect(screen.getByText("Skip GitHub for now?")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Go back" }));
		expect(screen.queryByText("Skip GitHub for now?")).toBeNull();
		expect(onContinue).not.toHaveBeenCalled();

		fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
		fireEvent.click(screen.getByRole("button", { name: "Skip" }));
		expect(onContinue).toHaveBeenCalledTimes(1);

		view.rerender(<GitHubStepContinue ghReady onContinue={onContinue} />);
		expect(screen.queryByRole("button", { name: "Skip for now" })).toBeNull();
		fireEvent.click(screen.getByRole("button", { name: "Continue" }));
		expect(onContinue).toHaveBeenCalledTimes(2);
		expect(screen.queryByText("Skip GitHub for now?")).toBeNull();
	});
});

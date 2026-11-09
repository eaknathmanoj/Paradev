import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { installGhCli } from "./install-gh-cli";

const ZIP_BYTES = new TextEncoder().encode("pretend zip");
const ASSET = "gh_9.9.9_macOS_arm64.zip";
const tempDirs: string[] = [];

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

function fakeGitHub(checksum: string) {
	return async (url: string) => {
		if (url.endsWith("/releases/latest")) {
			return Response.json({
				tag_name: "v9.9.9",
				assets: [
					{ name: ASSET, browser_download_url: "https://dl/zip" },
					{
						name: "gh_9.9.9_checksums.txt",
						browser_download_url: "https://dl/sums",
					},
				],
			});
		}
		if (url === "https://dl/sums") {
			return new Response(
				`${"0".repeat(64)}  gh_9.9.9_macOS_amd64.zip\n${checksum}  ${ASSET}\n`,
			);
		}
		return new Response(ZIP_BYTES);
	};
}

async function fakeExtract(_zip: string, destDir: string) {
	const bin = path.join(destDir, "gh_9.9.9_macOS_arm64", "bin");
	fs.mkdirSync(bin, { recursive: true });
	fs.writeFileSync(
		path.join(bin, "gh"),
		'#!/bin/sh\necho "gh version 9.9.9 (test)"\n',
	);
}

function newBinDir() {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gh-install-test-"));
	tempDirs.push(dir);
	return path.join(dir, "bin");
}

describe("installGhCli", () => {
	test("installs only a download that matches the release checksum", async () => {
		const goodSum = createHash("sha256").update(ZIP_BYTES).digest("hex");

		const rejectedBinDir = newBinDir();
		const rejected = await installGhCli({
			binDir: rejectedBinDir,
			arch: "arm64",
			fetch: fakeGitHub("f".repeat(64)),
			extractZip: fakeExtract,
		});
		expect(rejected).toEqual({ stage: "failed", reason: "checksum" });
		expect(fs.existsSync(path.join(rejectedBinDir, "gh"))).toBe(false);

		const binDir = newBinDir();
		const installed = await installGhCli({
			binDir,
			arch: "arm64",
			fetch: fakeGitHub(goodSum),
			extractZip: fakeExtract,
		});
		expect(installed).toEqual({ stage: "done", version: "9.9.9" });
		expect(fs.statSync(path.join(binDir, "gh")).mode & 0o111).toBeTruthy();
	});
});

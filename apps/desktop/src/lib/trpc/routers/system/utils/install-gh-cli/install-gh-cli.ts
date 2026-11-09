import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const LATEST_RELEASE_URL =
	"https://api.github.com/repos/cli/cli/releases/latest";

export type GhInstallFailure = "download" | "checksum" | "install";

export type GhInstallEvent =
	| { stage: "downloading"; receivedBytes: number; totalBytes: number | null }
	| { stage: "verifying" }
	| { stage: "installing" }
	| { stage: "done"; version: string }
	| { stage: "failed"; reason: GhInstallFailure };

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export interface InstallGhCliOptions {
	binDir: string;
	arch?: string;
	fetch?: Fetcher;
	extractZip?: (zipPath: string, destDir: string) => Promise<void>;
	onProgress?: (event: GhInstallEvent) => void;
	signal?: AbortSignal;
}

interface ReleaseAsset {
	name: string;
	browser_download_url: string;
	size?: number;
}

class InstallFailure extends Error {
	constructor(readonly reason: GhInstallFailure) {
		super(reason);
	}
}

export function expectedSha256(
	checksums: string,
	assetName: string,
): string | null {
	for (const line of checksums.split("\n")) {
		const [hash, name] = line.trim().split(/\s+/);
		if (name === assetName && hash && /^[a-f0-9]{64}$/i.test(hash)) {
			return hash.toLowerCase();
		}
	}
	return null;
}

async function dittoExtract(zipPath: string, destDir: string): Promise<void> {
	await execFileAsync("/usr/bin/ditto", ["-x", "-k", zipPath, destDir]);
}

async function getOk(
	fetcher: Fetcher,
	url: string,
	signal?: AbortSignal,
): Promise<Response> {
	const response = await fetcher(url, {
		headers: {
			Accept: "application/vnd.github+json",
			"User-Agent": "Paradev-Desktop",
		},
		signal,
	}).catch(() => {
		throw new InstallFailure("download");
	});
	if (!response.ok) throw new InstallFailure("download");
	return response;
}

/**
 * Installs the official macOS `gh` build into `binDir`. The binary is fetched
 * by the app, not a browser, so it carries no quarantine flag for Gatekeeper.
 */
export async function installGhCli(
	options: InstallGhCliOptions,
): Promise<GhInstallEvent> {
	const fetcher = options.fetch ?? fetch;
	const extract = options.extractZip ?? dittoExtract;
	const emit = (event: GhInstallEvent) => options.onProgress?.(event);
	const arch = (options.arch ?? process.arch) === "arm64" ? "arm64" : "amd64";
	let workDir: string | null = null;

	try {
		const release = (await (
			await getOk(fetcher, LATEST_RELEASE_URL, options.signal)
		).json()) as { tag_name?: string; assets?: ReleaseAsset[] };
		const version = release.tag_name?.replace(/^v/, "");
		const assets = release.assets ?? [];
		const assetName = `gh_${version}_macOS_${arch}.zip`;
		const zipAsset = assets.find((asset) => asset.name === assetName);
		const sumsAsset = assets.find(
			(asset) => asset.name === `gh_${version}_checksums.txt`,
		);
		if (!version || !zipAsset || !sumsAsset) {
			throw new InstallFailure("download");
		}

		const checksums = await (
			await getOk(fetcher, sumsAsset.browser_download_url, options.signal)
		).text();
		const expected = expectedSha256(checksums, assetName);
		if (!expected) throw new InstallFailure("checksum");

		const zipResponse = await getOk(
			fetcher,
			zipAsset.browser_download_url,
			options.signal,
		);
		const totalBytes =
			Number(zipResponse.headers.get("content-length")) ||
			zipAsset.size ||
			null;
		const hash = createHash("sha256");
		const chunks: Uint8Array[] = [];
		let receivedBytes = 0;
		emit({ stage: "downloading", receivedBytes, totalBytes });
		const reader = zipResponse.body?.getReader();
		if (!reader) throw new InstallFailure("download");
		for (;;) {
			const { done, value } = await reader.read().catch(() => {
				throw new InstallFailure("download");
			});
			if (done) break;
			chunks.push(value);
			hash.update(value);
			receivedBytes += value.byteLength;
			emit({ stage: "downloading", receivedBytes, totalBytes });
		}

		emit({ stage: "verifying" });
		if (hash.digest("hex") !== expected) throw new InstallFailure("checksum");

		emit({ stage: "installing" });
		workDir = await fs.mkdtemp(path.join(os.tmpdir(), "paradev-gh-"));
		const zipPath = path.join(workDir, assetName);
		const extractDir = path.join(workDir, "extracted");
		await fs.writeFile(zipPath, Buffer.concat(chunks));
		await fs.mkdir(extractDir);
		await extract(zipPath, extractDir);

		const extractedBinary = path.join(
			extractDir,
			assetName.replace(/\.zip$/, ""),
			"bin",
			"gh",
		);
		const target = path.join(options.binDir, "gh");
		const staged = `${target}.${process.pid}.tmp`;
		await fs.mkdir(options.binDir, { recursive: true });
		await fs.copyFile(extractedBinary, staged);
		await fs.chmod(staged, 0o755);
		await fs.rename(staged, target);

		const { stdout } = await execFileAsync(target, ["--version"], {
			timeout: 10_000,
		});
		const installedVersion = stdout.match(/gh version (\S+)/)?.[1] ?? version;
		const done: GhInstallEvent = { stage: "done", version: installedVersion };
		emit(done);
		return done;
	} catch (error) {
		const failed: GhInstallEvent = {
			stage: "failed",
			reason: error instanceof InstallFailure ? error.reason : "install",
		};
		emit(failed);
		return failed;
	} finally {
		if (workDir) {
			await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
		}
	}
}

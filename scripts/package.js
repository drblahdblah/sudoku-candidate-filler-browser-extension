"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const {
  DEFAULT_OUTPUT_ROOT,
  FIREFOX_PLACEHOLDER_GECKO_ID,
  TARGET_MANIFEST_PATHS,
  buildTarget,
} = require("./build.js");

const ROOT_DIR = path.resolve(__dirname, "..");
const FIREFOX_EMAIL_LIKE_GECKO_ID = /^[a-zA-Z0-9._-]*@[a-zA-Z0-9._-]+$/;
const FIREFOX_GUID_GECKO_ID =
  /^\{[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\}$/;
const MAX_FIREFOX_EMAIL_LIKE_GECKO_ID_LENGTH = 80;

function run(command, argumentsList, options) {
  const result = spawnSync(command, argumentsList, {
    encoding: "utf8",
    ...options,
  });
  if (result.error) {
    throw new Error(`Could not run ${command}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `${command} failed: ${(result.stderr || result.stdout || "unknown error").trim()}`,
    );
  }
  return result.stdout;
}

function expectedArchiveFiles() {
  return [
    "manifest.json",
    "src/background.js",
    "src/candidates.js",
    "src/content.js",
    "src/grid-dom.js",
    "assets/icons/icon-16.png",
    "assets/icons/icon-32.png",
    "assets/icons/icon-48.png",
    "assets/icons/icon-128.png",
  ].sort();
}

function validateArchive(archivePath) {
  run("unzip", ["-tqq", archivePath], { cwd: ROOT_DIR });
  const archiveFiles = run("unzip", ["-Z1", archivePath], { cwd: ROOT_DIR })
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((entry) => !entry.endsWith("/"))
    .sort();
  const expectedFiles = expectedArchiveFiles();
  if (JSON.stringify(archiveFiles) !== JSON.stringify(expectedFiles)) {
    throw new Error(
      `Archive contains unexpected files: ${archiveFiles.join(", ")}`,
    );
  }
}

function releaseFirefoxGeckoId(firefoxGeckoId = process.env.FIREFOX_GECKO_ID) {
  const configuredId = firefoxGeckoId?.trim();
  if (!configuredId || configuredId === FIREFOX_PLACEHOLDER_GECKO_ID) {
    throw new Error(
      "Firefox release packaging requires FIREFOX_GECKO_ID to be a publisher-controlled Gecko add-on ID, not the documented placeholder",
    );
  }
  const isEmailLikeId =
    configuredId.length <= MAX_FIREFOX_EMAIL_LIKE_GECKO_ID_LENGTH &&
    FIREFOX_EMAIL_LIKE_GECKO_ID.test(configuredId);
  if (!isEmailLikeId && !FIREFOX_GUID_GECKO_ID.test(configuredId)) {
    throw new Error(
      "Firefox release packaging requires FIREFOX_GECKO_ID to be an email-like add-on ID (80 characters or fewer) or a braced GUID",
    );
  }
  return configuredId;
}

function packageTarget(
  target,
  outputRoot = DEFAULT_OUTPUT_ROOT,
  { firefoxGeckoId } = {},
) {
  if (!TARGET_MANIFEST_PATHS[target]) {
    throw new RangeError(`Unknown browser target: ${target}`);
  }
  const packageDir = buildTarget(
    target,
    outputRoot,
    target === "firefox"
      ? { firefoxGeckoId: releaseFirefoxGeckoId(firefoxGeckoId) }
      : undefined,
  );
  const archivePath = path.join(
    outputRoot,
    `sudoku-candidate-filler-${target}.zip`,
  );
  fs.mkdirSync(outputRoot, { recursive: true });
  fs.rmSync(archivePath, { force: true });
  run("zip", ["-q", "-r", archivePath, "."], { cwd: packageDir });
  validateArchive(archivePath);
  return archivePath;
}

function packageAll(outputRoot = DEFAULT_OUTPUT_ROOT, options) {
  const firefoxGeckoId = releaseFirefoxGeckoId(options?.firefoxGeckoId);
  return Object.keys(TARGET_MANIFEST_PATHS).map((target) =>
    packageTarget(target, outputRoot, { ...options, firefoxGeckoId }),
  );
}

if (require.main === module) {
  for (const archivePath of packageAll()) {
    console.log(`Packaged ${path.relative(ROOT_DIR, archivePath)}`);
  }
}

module.exports = {
  expectedArchiveFiles,
  packageAll,
  packageTarget,
  releaseFirefoxGeckoId,
  validateArchive,
};

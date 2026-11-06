"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { DEFAULT_OUTPUT_ROOT, buildTarget } = require("./build.js");

const ROOT_DIR = path.resolve(__dirname, "..");
const CONFIG_PATH = path.join(ROOT_DIR, "config", "safari-webextension.json");
const MODERN_PACKAGER = "safari-web-extension-packager";
const LEGACY_PACKAGER = "safari-web-extension-converter";
const APPLE_BUNDLE_IDENTIFIER_PLACEHOLDER = "com.example.sudokucandidatefiller";
const BUNDLE_IDENTIFIER_PATTERN = /^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;

function fail(message) {
  throw new Error(`Invalid Safari wrapper configuration: ${message}`);
}

function loadSafariConfig(configPath = CONFIG_PATH) {
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  if (config.appName !== "Sudoku Candidate Filler") {
    fail("appName must remain Sudoku Candidate Filler");
  }
  if (config.bundleIdentifier !== APPLE_BUNDLE_IDENTIFIER_PLACEHOLDER) {
    fail(
      `bundleIdentifier must remain the documented placeholder ${APPLE_BUNDLE_IDENTIFIER_PLACEHOLDER}`,
    );
  }
  if (config.platform !== "macos") {
    fail("platform must be macos");
  }
  if (config.sourceTarget !== "safari") {
    fail("sourceTarget must be safari");
  }
  return config;
}

function resolveBundleIdentifier(config, bundleIdentifier = process.env.SAFARI_BUNDLE_IDENTIFIER) {
  const value = (bundleIdentifier ?? config.bundleIdentifier).trim();
  if (!BUNDLE_IDENTIFIER_PATTERN.test(value)) {
    fail("SAFARI_BUNDLE_IDENTIFIER must be a reverse-DNS-style bundle identifier");
  }
  return value;
}

function xcrunFind(tool) {
  const result = spawnSync("xcrun", ["--find", tool], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

function availablePackager() {
  if (xcrunFind(MODERN_PACKAGER)) {
    return MODERN_PACKAGER;
  }
  if (xcrunFind(LEGACY_PACKAGER)) {
    return LEGACY_PACKAGER;
  }
  return null;
}

function prepareSafariExtension(outputRoot = DEFAULT_OUTPUT_ROOT) {
  return buildTarget("safari", outputRoot);
}

function packagerArguments(packager, extensionDirectory, config, outputRoot) {
  if (packager === MODERN_PACKAGER || packager === LEGACY_PACKAGER) {
    return [
      packager,
      extensionDirectory,
      "--project-location",
      path.join(outputRoot, "safari-host-app"),
      "--app-name",
      config.appName,
      "--bundle-identifier",
      config.bundleIdentifier,
      "--swift",
      "--macos-only",
      "--copy-resources",
      "--no-open",
      "--no-prompt",
      "--force",
    ];
  }
  throw new RangeError(`Unsupported Safari packager: ${packager}`);
}

function runSafariPackager(packager, extensionDirectory, config, outputRoot) {
  const result = spawnSync(
    "xcrun",
    packagerArguments(packager, extensionDirectory, config, outputRoot),
    {
      cwd: ROOT_DIR,
      encoding: "utf8",
      stdio: "inherit",
    },
  );
  if (result.error) {
    throw new Error(`Could not run ${packager}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`${packager} failed with status ${result.status}`);
  }
}

function generateSafariWrapper(outputRoot = DEFAULT_OUTPUT_ROOT) {
  const sourceConfig = loadSafariConfig();
  const config = {
    ...sourceConfig,
    bundleIdentifier: resolveBundleIdentifier(sourceConfig),
  };
  const extensionDirectory = prepareSafariExtension(outputRoot);
  const packager = availablePackager();
  if (!packager) {
    return { config, extensionDirectory, packager: null };
  }
  runSafariPackager(packager, extensionDirectory, config, outputRoot);
  return { config, extensionDirectory, packager };
}

if (require.main === module) {
  const result = generateSafariWrapper();
  if (!result.packager) {
    console.error(
      `Safari extension source prepared at ${path.relative(ROOT_DIR, result.extensionDirectory)}.`,
    );
    console.error(
      "Xcode's Safari Web Extension packager is unavailable. Install Xcode, then rerun this command.",
    );
    process.exitCode = 1;
  } else {
    console.log(`Generated macOS Safari wrapper with ${result.packager}.`);
  }
}

module.exports = {
  APPLE_BUNDLE_IDENTIFIER_PLACEHOLDER,
  CONFIG_PATH,
  LEGACY_PACKAGER,
  MODERN_PACKAGER,
  availablePackager,
  generateSafariWrapper,
  loadSafariConfig,
  packagerArguments,
  prepareSafariExtension,
  resolveBundleIdentifier,
};

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_OUTPUT_ROOT = path.join(ROOT_DIR, "dist");
const SHARED_MANIFEST_PATH = path.join(ROOT_DIR, "manifests", "shared.json");
const FIREFOX_PLACEHOLDER_GECKO_ID = "sudoku-candidate-filler@example.invalid";
const TARGET_MANIFEST_PATHS = {
  chromium: path.join(ROOT_DIR, "manifests", "chromium.json"),
  firefox: path.join(ROOT_DIR, "manifests", "firefox.json"),
};
const HOST_PERMISSION = "https://www.theage.com.au/puzzles/sudoku/*";
const EXPECTED_SOURCE_FILES = [
  "src/background.js",
  "src/candidates.js",
  "src/content.js",
  "src/grid-dom.js",
];
const ICON_FILES = [16, 32, 48, 128].map((size) => `assets/icons/icon-${size}.png`);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function fail(message) {
  throw new Error(`Invalid extension package: ${message}`);
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

function buildManifest(target, { firefoxGeckoId } = {}) {
  const targetPath = TARGET_MANIFEST_PATHS[target];
  if (!targetPath) {
    throw new RangeError(`Unknown browser target: ${target}`);
  }
  const manifest = {
    ...readJson(SHARED_MANIFEST_PATH),
    ...readJson(targetPath),
  };
  if (target !== "firefox" || firefoxGeckoId === undefined) {
    return manifest;
  }
  return {
    ...manifest,
    browser_specific_settings: {
      ...manifest.browser_specific_settings,
      gecko: {
        ...manifest.browser_specific_settings.gecko,
        id: firefoxGeckoId,
      },
    },
  };
}

function validateCommonManifest(manifest) {
  assert(manifest.manifest_version === 3, "manifest_version must be 3");
  assert(Array.isArray(manifest.permissions), "permissions must be an array");
  assert(
    manifest.permissions.length === 1 && manifest.permissions[0] === "storage",
    "only the storage permission is allowed",
  );
  assert(
    Array.isArray(manifest.host_permissions) &&
      manifest.host_permissions.length === 1 &&
      manifest.host_permissions[0] === HOST_PERMISSION,
    `host permission must only be ${HOST_PERMISSION}`,
  );
  assert(Array.isArray(manifest.content_scripts), "content_scripts must be an array");
  for (const contentScript of manifest.content_scripts) {
    assert(
      Array.isArray(contentScript.matches) &&
        contentScript.matches.length === 1 &&
        contentScript.matches[0] === HOST_PERMISSION,
      "content scripts must only match The Age Sudoku",
    );
    assert(
      Array.isArray(contentScript.js) &&
        contentScript.js.every((file) => file.startsWith("src/") && !file.includes("://")),
      "content scripts must be packaged local source files",
    );
  }
  assert(
    Object.values(manifest.icons).every(
      (file) => file.startsWith("assets/icons/") && file.endsWith(".png"),
    ),
    "icons must be packaged PNG files",
  );
}

function validateTargetManifest(target, manifest) {
  validateCommonManifest(manifest);
  if (target === "chromium") {
    assert(
      manifest.background?.service_worker === "src/background.js",
      "Chromium must use src/background.js as its service worker",
    );
    assert(!manifest.background.scripts, "Chromium must not use background scripts");
    assert(
      !manifest.browser_specific_settings,
      "Chromium must not include Firefox-specific settings",
    );
    return;
  }

  assert(
    Array.isArray(manifest.background?.scripts) &&
      manifest.background.scripts.length === 1 &&
      manifest.background.scripts[0] === "src/background.js",
    "Firefox must use src/background.js as its event background script",
  );
  assert(
    manifest.background.persistent === false,
    "Firefox background must be non-persistent",
  );
  assert(
    !manifest.background.service_worker,
    "Firefox must not use the Chromium service-worker background",
  );
  assert(
    typeof manifest.browser_specific_settings?.gecko?.id === "string" &&
      manifest.browser_specific_settings.gecko.id.trim().length > 0,
    "Firefox must declare a Gecko add-on ID",
  );
  assert(
    JSON.stringify(
      manifest.browser_specific_settings?.gecko?.data_collection_permissions?.required,
    ) === JSON.stringify(["none"]),
    "Firefox must declare that no data collection is required",
  );
}

function copyFileToPackage(sourceFile, packageDir) {
  const sourcePath = path.join(ROOT_DIR, sourceFile);
  const destinationPath = path.join(packageDir, sourceFile);
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.copyFileSync(sourcePath, destinationPath);
}

function validatePackageFiles(packageDir) {
  for (const file of [...EXPECTED_SOURCE_FILES, ...ICON_FILES, "manifest.json"]) {
    assert(fs.existsSync(path.join(packageDir, file)), `missing ${file}`);
  }
  const manifest = readJson(path.join(packageDir, "manifest.json"));
  for (const contentScript of manifest.content_scripts) {
    for (const script of contentScript.js) {
      assert(fs.existsSync(path.join(packageDir, script)), `missing ${script}`);
    }
  }
  const backgroundFile =
    manifest.background.service_worker ?? manifest.background.scripts?.[0];
  assert(fs.existsSync(path.join(packageDir, backgroundFile)), `missing ${backgroundFile}`);
}

function buildTarget(target, outputRoot = DEFAULT_OUTPUT_ROOT, options) {
  const manifest = buildManifest(target, options);
  validateTargetManifest(target, manifest);

  const packageDir = path.join(outputRoot, target);
  fs.rmSync(packageDir, { recursive: true, force: true });
  fs.mkdirSync(packageDir, { recursive: true });
  fs.writeFileSync(
    path.join(packageDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  for (const file of [...EXPECTED_SOURCE_FILES, ...ICON_FILES]) {
    copyFileToPackage(file, packageDir);
  }
  validatePackageFiles(packageDir);
  return packageDir;
}

function buildAll(outputRoot = DEFAULT_OUTPUT_ROOT) {
  return Object.keys(TARGET_MANIFEST_PATHS).map((target) => buildTarget(target, outputRoot));
}

function parseTargetArgument(argumentsList) {
  if (argumentsList.length === 0) {
    return null;
  }
  if (argumentsList.length === 2 && argumentsList[0] === "--target") {
    return argumentsList[1];
  }
  throw new Error("Usage: node scripts/build.js [--target chromium|firefox]");
}

if (require.main === module) {
  const target = parseTargetArgument(process.argv.slice(2));
  const outputDirectories = target ? [buildTarget(target)] : buildAll();
  for (const directory of outputDirectories) {
    console.log(`Built ${path.relative(ROOT_DIR, directory)}`);
  }
}

module.exports = {
  DEFAULT_OUTPUT_ROOT,
  FIREFOX_PLACEHOLDER_GECKO_ID,
  HOST_PERMISSION,
  TARGET_MANIFEST_PATHS,
  buildAll,
  buildManifest,
  buildTarget,
  validatePackageFiles,
  validateTargetManifest,
};

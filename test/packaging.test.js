const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  FIREFOX_PLACEHOLDER_GECKO_ID,
  HOST_PERMISSION,
  buildManifest,
  buildTarget,
  validateTargetManifest,
} = require("../scripts/build.js");
const {
  expectedArchiveFiles,
  packageAll,
  packageTarget,
  releaseFirefoxGeckoId,
} = require("../scripts/package.js");
const {
  APPLE_BUNDLE_IDENTIFIER_PLACEHOLDER,
  LEGACY_PACKAGER,
  MODERN_PACKAGER,
  loadSafariConfig,
  packagerArguments,
  prepareSafariExtension,
  resolveBundleIdentifier,
} = require("../scripts/generate-safari-wrapper.js");

const ROOT_DIR = path.resolve(__dirname, "..");

function createTemporaryOutput(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scf-package-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function unzip(archivePath, argumentsList, encoding) {
  const result = spawnSync("unzip", argumentsList, { encoding });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}

function sourceAssetContents() {
  return new Map(
    expectedArchiveFiles()
      .filter((file) => file.startsWith("assets/"))
      .map((file) => {
        const assetPath = path.join(ROOT_DIR, file);
        const stats = fs.statSync(assetPath);
        return [
          file,
          {
            contents: fs.readFileSync(assetPath),
            modifiedAt: stats.mtimeMs,
          },
        ];
      }),
  );
}

test("generates isolated Chromium and Firefox manifests from shared source", (t) => {
  const outputRoot = createTemporaryOutput(t);
  const chromiumDirectory = buildTarget("chromium", outputRoot);
  const firefoxDirectory = buildTarget("firefox", outputRoot);
  const chromiumManifest = JSON.parse(
    fs.readFileSync(path.join(chromiumDirectory, "manifest.json"), "utf8"),
  );
  const firefoxManifest = JSON.parse(
    fs.readFileSync(path.join(firefoxDirectory, "manifest.json"), "utf8"),
  );

  assert.deepEqual(chromiumManifest.background, {
    service_worker: "src/background.js",
  });
  assert.equal(chromiumManifest.browser_specific_settings, undefined);
  assert.deepEqual(firefoxManifest.background, {
    scripts: ["src/background.js"],
    persistent: false,
  });
  assert.equal(
    firefoxManifest.browser_specific_settings.gecko.id,
    "sudoku-candidate-filler@example.invalid",
  );
  assert.deepEqual(
    firefoxManifest.browser_specific_settings.gecko.data_collection_permissions,
    { required: ["none"] },
  );

  for (const packageDirectory of [chromiumDirectory, firefoxDirectory]) {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(packageDirectory, "manifest.json"), "utf8"),
    );
    assert.deepEqual(manifest.permissions, ["storage"]);
    assert.deepEqual(manifest.host_permissions, [HOST_PERMISSION]);
    assert.ok(fs.existsSync(path.join(packageDirectory, "src/content.js")));
    assert.ok(fs.existsSync(path.join(packageDirectory, "assets/icons/icon-128.png")));
  }
});

test("keeps a Chromium manifest at the repository root for Load unpacked", () => {
  const rootManifest = JSON.parse(
    fs.readFileSync(path.join(ROOT_DIR, "manifest.json"), "utf8"),
  );

  assert.deepEqual(rootManifest, buildManifest("chromium"));
});

test("generates a Safari source package with the existing narrow permissions", (t) => {
  const outputRoot = createTemporaryOutput(t);
  const safariDirectory = prepareSafariExtension(outputRoot);
  const manifest = JSON.parse(
    fs.readFileSync(path.join(safariDirectory, "manifest.json"), "utf8"),
  );

  assert.deepEqual(manifest.background, {
    service_worker: "src/background.js",
  });
  assert.equal(manifest.browser_specific_settings, undefined);
  assert.deepEqual(manifest.permissions, ["storage"]);
  assert.deepEqual(manifest.host_permissions, [HOST_PERMISSION]);
});

test("uses the documented placeholder configuration for Safari wrapper generation", () => {
  const config = loadSafariConfig();

  assert.equal(config.bundleIdentifier, APPLE_BUNDLE_IDENTIFIER_PLACEHOLDER);
  assert.equal(resolveBundleIdentifier(config), APPLE_BUNDLE_IDENTIFIER_PLACEHOLDER);
  assert.equal(
    resolveBundleIdentifier(config, "com.publisher.sudokucandidatefiller"),
    "com.publisher.sudokucandidatefiller",
  );
  assert.throws(
    () => resolveBundleIdentifier(config, "not a bundle identifier"),
    /reverse-DNS-style bundle identifier/,
  );
  assert.deepEqual(
    packagerArguments(MODERN_PACKAGER, "/tmp/safari", config, "/tmp/output"),
    [
      MODERN_PACKAGER,
      "/tmp/safari",
      "--project-location",
      "/tmp/output/safari-host-app",
      "--app-name",
      "Sudoku Candidate Filler",
      "--bundle-identifier",
      APPLE_BUNDLE_IDENTIFIER_PLACEHOLDER,
      "--swift",
      "--macos-only",
      "--copy-resources",
      "--no-open",
      "--no-prompt",
      "--force",
    ],
  );
  assert.deepEqual(
    packagerArguments(LEGACY_PACKAGER, "/tmp/safari", config, "/tmp/output"),
    [
      LEGACY_PACKAGER,
      "/tmp/safari",
      "--project-location",
      "/tmp/output/safari-host-app",
      "--app-name",
      "Sudoku Candidate Filler",
      "--bundle-identifier",
      APPLE_BUNDLE_IDENTIFIER_PLACEHOLDER,
      "--swift",
      "--macos-only",
      "--copy-resources",
      "--no-open",
      "--no-prompt",
      "--force",
    ],
  );
});

test("rejects package manifests that broaden the host permission", () => {
  const manifest = buildManifest("chromium");
  manifest.host_permissions = ["https://*/*"];

  assert.throws(
    () => validateTargetManifest("chromium", manifest),
    /host permission must only be/,
  );
});

test("limits store archives to local manifest, source, and icon files", () => {
  assert.deepEqual(expectedArchiveFiles(), [
    "assets/icons/icon-128.png",
    "assets/icons/icon-16.png",
    "assets/icons/icon-32.png",
    "assets/icons/icon-48.png",
    "manifest.json",
    "src/background.js",
    "src/candidates.js",
    "src/content.js",
    "src/grid-dom.js",
  ]);
});

test("requires an explicit publisher-controlled Gecko ID for Firefox release packaging", (t) => {
  const outputRoot = createTemporaryOutput(t);

  assert.throws(
    () =>
      packageTarget("firefox", outputRoot, {
        firefoxGeckoId: FIREFOX_PLACEHOLDER_GECKO_ID,
      }),
    /FIREFOX_GECKO_ID.*publisher-controlled Gecko add-on ID/,
  );
  assert.equal(
    fs.existsSync(path.join(outputRoot, "sudoku-candidate-filler-firefox.zip")),
    false,
  );
});

test("accepts only Firefox-supported Gecko add-on ID forms for release packaging", () => {
  assert.equal(
    releaseFirefoxGeckoId("sudoku-candidate-filler@publisher.example"),
    "sudoku-candidate-filler@publisher.example",
  );
  const maximumLengthEmailLikeId = `${"a".repeat(78)}@b`;
  assert.equal(
    releaseFirefoxGeckoId(maximumLengthEmailLikeId),
    maximumLengthEmailLikeId,
  );
  assert.equal(
    releaseFirefoxGeckoId("{01234567-89ab-cdef-0123-456789abcdef}"),
    "{01234567-89ab-cdef-0123-456789abcdef}",
  );

  for (const malformedId of [
    "foo",
    "sudoku-candidate-filler@",
    "{01234567-89ab-cdef-0123-456789abcdef",
    `${"a".repeat(79)}@b`,
  ]) {
    assert.throws(
      () => releaseFirefoxGeckoId(malformedId),
      /FIREFOX_GECKO_ID.*email-like add-on ID.*braced GUID/,
    );
  }
});

test("packages intact Chromium and Firefox ZIP archives without changing source assets", (t) => {
  const outputRoot = createTemporaryOutput(t);
  const assetsBeforePackaging = sourceAssetContents();
  const archives = packageAll(outputRoot, {
    firefoxGeckoId: "sudoku-candidate-filler@publisher.example",
  });

  assert.deepEqual(
    archives.sort(),
    [
      path.join(outputRoot, "sudoku-candidate-filler-chromium.zip"),
      path.join(outputRoot, "sudoku-candidate-filler-firefox.zip"),
    ].sort(),
  );

  for (const archivePath of archives) {
    const target = path.basename(archivePath).includes("firefox")
      ? "firefox"
      : "chromium";
    assert.equal(fs.existsSync(archivePath), true);
    unzip(archivePath, ["-tqq", archivePath], "utf8");
    const archiveFiles = unzip(archivePath, ["-Z1", archivePath], "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .filter((entry) => !entry.endsWith("/"))
      .sort();
    assert.deepEqual(archiveFiles, expectedArchiveFiles());

    for (const file of expectedArchiveFiles().filter((entry) => entry !== "manifest.json")) {
      assert.deepEqual(
        unzip(archivePath, ["-p", archivePath, file]),
        fs.readFileSync(path.join(ROOT_DIR, file)),
        `${path.basename(archivePath)} must contain the current ${file}`,
      );
    }

    const manifest = JSON.parse(unzip(archivePath, ["-p", archivePath, "manifest.json"], "utf8"));
    if (target === "firefox") {
      assert.equal(
        manifest.browser_specific_settings.gecko.id,
        "sudoku-candidate-filler@publisher.example",
      );
    } else {
      assert.equal(manifest.browser_specific_settings, undefined);
    }
  }

  assert.deepEqual(sourceAssetContents(), assetsBeforePackaging);
});

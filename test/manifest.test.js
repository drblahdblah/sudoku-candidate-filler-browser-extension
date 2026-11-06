const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { buildManifest } = require("../scripts/build.js");

const projectRoot = path.join(__dirname, "..");
const sharedCandidateScripts = [
  "src/candidates.js",
  "src/grid-dom.js",
  "src/content.js",
];

test("the generated Chromium manifest includes the shared candidate scripts", () => {
  const manifest = buildManifest("chromium");
  const contentScripts = manifest.content_scripts.flatMap((entry) => entry.js ?? []);

  assert.deepEqual(contentScripts, sharedCandidateScripts);
  for (const scriptPath of contentScripts) {
    assert.ok(
      fs.existsSync(path.join(projectRoot, scriptPath)),
      `generated manifest references ${scriptPath}`,
    );
  }
});

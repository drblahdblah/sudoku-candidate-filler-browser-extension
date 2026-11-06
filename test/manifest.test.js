const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const projectRoot = path.join(__dirname, "..");
const sharedCandidateScripts = [
  "src/candidates.js",
  "src/grid-dom.js",
  "src/content.js",
];

test("every available manifest includes the shared candidate scripts", () => {
  const manifestPaths = [path.join(projectRoot, "manifest.json")].filter(
    fs.existsSync,
  );

  assert.ok(manifestPaths.length > 0, "expected at least one extension manifest");
  for (const manifestPath of manifestPaths) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const contentScripts = manifest.content_scripts.flatMap((entry) => entry.js ?? []);

    assert.deepEqual(contentScripts, sharedCandidateScripts);
    for (const scriptPath of contentScripts) {
      assert.ok(
        fs.existsSync(path.join(projectRoot, scriptPath)),
        `${path.basename(manifestPath)} references ${scriptPath}`,
      );
    }
  }
});

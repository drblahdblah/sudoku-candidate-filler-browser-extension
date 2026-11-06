# Sudoku Candidate Filler

A local WebExtension that automatically shows standard pencil-mark candidates
for The Age Sudoku puzzles in Chromium-family browsers and Firefox.

For each empty cell, it displays every digit that is not already used in that
cell's row, column, or 3×3 box. It recalculates after the puzzle changes.

## Install locally

1. Clone this repository or open this folder locally.
2. For Chrome, Edge, Brave, Opera, or Vivaldi:
   - Open the browser's extensions page (for Chrome:
     `chrome://extensions`).
   - Enable developer mode and select **Load unpacked**.
   - Choose this repository's root folder. It contains a Chromium-compatible
     `manifest.json` for direct local loading.
3. For Firefox:
   - Run `npm run build`.
   - Open `about:debugging#/runtime/this-firefox`.
   - Select **Load Temporary Add-on** and choose
     `dist/firefox/manifest.json`.
4. For Safari on macOS, follow the [Safari Web Extension wrapper
   guide](docs/store/safari-webextension.md). It requires Xcode to create and
   run the host app.
5. Open an authenticated puzzle at
   `https://www.theage.com.au/puzzles/sudoku/...`.
6. The extension fills candidates automatically once the grid has loaded.

When you change a number, start a new puzzle, or return focus to the puzzle,
candidate marks update automatically. Clicking the extension's toolbar icon
also refreshes candidates without opening a popup, so it does not pause the
game.

## Development and packages

This project has no runtime dependencies. Run the candidate-calculation tests
with:

```sh
npm test
```

Build browser-specific unpacked extensions with:

```sh
npm run build
```

Create store-upload ZIP files in `dist/` with:

```sh
FIREFOX_GECKO_ID="sudoku-candidate-filler@your-publisher-domain.example" npm run package
```

Packaging requires the standard `zip` and `unzip` command-line tools. The build
uses one shared manifest definition and emits:

- `dist/chromium`: MV3 service-worker package for Chromium-family browsers.
- `dist/firefox`: MV3 package with Firefox's non-persistent event background.
- `dist/safari`: MV3 source package for Apple's Safari Web Extension packager.

Firefox release packaging requires `FIREFOX_GECKO_ID` to be the
publisher-controlled Gecko add-on ID assigned for the AMO release. It fails if
the variable is missing, malformed, or retains the checked-in placeholder. The
ID must be an email-like value of 80 characters or fewer (for example,
`sudoku-candidate-filler@publisher.example`) or a braced GUID. Local unpacked
Firefox builds keep the placeholder, and packaging applies the release ID only
to the generated archive without changing the source manifest or icon assets.

## Safari macOS wrapper

Build Safari-compatible WebExtension source from the shared implementation:

```sh
npm run build:safari
```

On a Mac with Xcode's Safari Web Extension packager installed, generate the
native macOS host-app/Xcode wrapper with:

```sh
npm run generate:safari-wrapper
```

The checked-in bundle identifier is the deliberate placeholder
`com.example.sudokucandidatefiller`. Set `SAFARI_BUNDLE_IDENTIFIER` to an
Apple Developer-owned identifier before creating a signable release wrapper.
The generator stages source in ignored `dist/` output and creates the Xcode
wrapper non-interactively using the configured name, identifier, and fixed
output path; it never signs, notarizes, uploads, or submits an app. See the
[Safari wrapper guide and App Store
checklist](docs/store/safari-webextension.md) for Xcode requirements, local
testing, placeholder replacement, and release metadata.

After editing extension files, rebuild, reload the extension from its generated
directory, then refresh the Sudoku page. See [store readiness
documents](docs/store/submission-checklists.md) for listing, privacy,
permissions, screenshots, and browser-specific preparation notes. The Firefox
Gecko add-on ID in source is deliberately a documented placeholder; release
packaging requires the stable publisher-selected ID through
`FIREFOX_GECKO_ID`. No signing or store submission is included.

## Scope and limitations

- Supports the current table-based Sudoku markup at The Age only.
- Uses the browser session you already have; it does not read credentials, make
  requests, or bypass subscription access.
- Updates only the existing nine candidate spans in empty cells and does not
  click puzzle controls or change completed cells.
- Provides standard row/column/box candidates. It does not apply advanced
  deductions such as naked pairs or box-line reductions.
- If the puzzle site's markup changes, the content-script selectors may need to
  be updated.

# macOS Safari Web Extension wrapper

This project ships one shared WebExtension implementation. Safari needs that
extension to be embedded in a native macOS host app before it can be enabled,
signed, or distributed. Generated Xcode projects are intentionally not tracked:
they are reproducible output and may contain local signing state.

## Prerequisites

- macOS with a current Xcode installation that provides either
  `safari-web-extension-packager` or the legacy
  `safari-web-extension-converter`.
- Node.js 18 or later.
- An Apple Developer account, team, certificates, and App Store Connect access
  only when preparing a signed release. None are needed to build the source
  package or run the tests.

Check the local packager with:

```sh
xcrun --find safari-web-extension-packager \
  || xcrun --find safari-web-extension-converter
```

## Reproducible wrapper generation

1. Validate the extension and create its Safari source package:

   ```sh
   npm test
   npm run build:safari
   ```

   The output, `dist/safari`, contains only the shared local JavaScript,
   manifest, and PNG icon assets. Its manifest retains the single The Age
   Sudoku host permission:
   `https://www.theage.com.au/puzzles/sudoku/*`.

2. Generate the wrapper:

   ```sh
   npm run generate:safari-wrapper
   ```

   The script rebuilds `dist/safari` and detects Apple's current packager
   first, then the legacy converter. Both are invoked non-interactively with
   the configured app name, bundle identifier, macOS platform, Swift language,
   fixed ignored output directory (`dist/safari-host-app`), copied resources,
   and `--no-open --no-prompt --force`. The command therefore never relies on
   answers entered at an Xcode prompt and replaces an existing generated
   wrapper at that output path.

3. The checked-in bundle identifier is a placeholder, not an identifier owned
   by this project. Before code signing or App Store work, register an
   identifier under the publisher's Apple Developer team and regenerate with:

   ```sh
   SAFARI_BUNDLE_IDENTIFIER="com.publisher.sudokucandidatefiller" \
     npm run generate:safari-wrapper
   ```

4. Open the generated `.xcodeproj`, assign the publisher's team to both the
   host app and Safari extension targets, and verify the host target uses the
   `SAFARI_BUNDLE_IDENTIFIER` value. Confirm the generated extension target's
   bundle identifier remains associated with that host app. Do not use the
   placeholder for a signed build.

The generator stops after staging `dist/safari` when Apple tooling is missing.
Install Xcode and rerun it; do not commit a hand-written approximation of
Apple's generated project.

## Local Safari validation

1. Build and run the generated host app from Xcode.
2. Enable the extension in Safari's Extensions settings.
3. Visit an authenticated The Age Sudoku puzzle manually.
4. Confirm candidates appear for empty cells, change after entering a value,
   and refresh after using the toolbar action.
5. Inspect the generated extension's permissions. It must have only `storage`
   plus the The Age Sudoku host restriction; it must not add broad host access,
   network permissions, remote code, credentials, analytics, or tracking.

## App Store Connect metadata and release checklist

Complete these items manually against Apple's current requirements; this
repository does not create accounts, sign builds, upload artifacts, or submit
for review.

- [ ] Replace the placeholder bundle identifier and use a publisher-controlled
  Apple Developer team for the host and extension targets.
- [ ] Set the final version and build number in the generated Xcode project.
- [ ] Provide app name, subtitle, description, keywords, primary category, and
  support URL using the approved store listing copy.
- [ ] Publish a public privacy policy URL and complete App Store privacy
  answers consistently with `privacy-and-permissions.md`: the extension
  collects no data and makes no network requests.
- [ ] Create current macOS App Store screenshots that show the host app,
  enabled extension, and candidate-filled Sudoku board without account data.
- [ ] Complete age-rating, pricing/availability, export-compliance, content
  rights, and contact fields with the publisher's actual information.
- [ ] Supply review notes explaining that the extension operates only on
  authenticated The Age Sudoku pages and requires the reviewer's own permitted
  access; never provide user credentials.
- [ ] Archive with the publisher's signing identity, validate in Xcode, and
  review the final permissions and privacy details before any upload.
- [ ] Re-run `npm test` and the local Safari validation steps against the exact
  source packaged into the archive.

# Browser store submission checklists

These checklists prepare artefacts only. They do not authorize account setup,
signing, uploads, review requests, or store submissions.

## Common release checks

1. Set the intended version in `manifests/shared.json`.
2. Run `npm test`, then package with the publisher-controlled Firefox ID:
   ```sh
   FIREFOX_GECKO_ID="sudoku-candidate-filler@your-publisher-domain.example" npm run package
   ```
3. Verify the generated packages contain only the manifest, local source files,
   and PNG icons.
4. Manually test the candidate fill and toolbar refresh on The Age Sudoku in
   each intended browser.
5. Review [listing copy](listing.md) and
   [privacy and permissions](privacy-and-permissions.md) for accuracy.
6. Create fresh screenshots using the checklist in `listing.md`.
7. Confirm there are no credentials, analytics, remote code, or added
   permissions in the final archive.

## Chrome Web Store

- Upload `dist/sudoku-candidate-filler-chromium.zip`.
- Supply the listing copy, current screenshots, support URL, and public privacy
  policy URL.
- Verify the store's displayed permissions match the documented `storage`
  permission and The Age Sudoku host restriction.
- Complete current developer, ownership, and policy declarations manually.

## Microsoft Edge Add-ons

- Upload `dist/sudoku-candidate-filler-chromium.zip`.
- Reuse listing copy only after checking Edge-specific field limits and image
  requirements.
- Review the generated package and permissions in the Edge submission UI.

## Firefox Add-ons (AMO)

- Upload `dist/sudoku-candidate-filler-firefox.zip`.
- The Firefox manifest intentionally uses a non-persistent event background:
  `background.scripts` with `persistent: false`.
- The checked-in Gecko ID,
  `sudoku-candidate-filler@example.invalid`, is development metadata only.
  Set `FIREFOX_GECKO_ID` to the stable publisher-controlled release ID before
  packaging. Packaging accepts an email-like ID of 80 characters or fewer or a
  braced GUID, and rejects a missing, malformed, or placeholder value. It
  injects the release ID into the generated archive without editing the source
  manifest. AMO verifies that the selected ID is unique. Update related release
  documentation at the same time.
- Complete AMO's current source, licensing, privacy, and reviewer notes using
  the documents in this directory.

## Opera, Brave, and Vivaldi

- The Chromium ZIP uses the standard MV3 Chromium target and is the starting
  point for these browsers.
- Before any upload, check the current browser-specific publishing process,
  manifest rules, and image requirements; do not assume another store's
  acceptance policy applies.
- For local sideload testing, build with `npm run build` and load
  `dist/chromium` as an unpacked extension using that browser's extension
  developer tools.

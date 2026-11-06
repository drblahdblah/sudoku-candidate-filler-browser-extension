# Privacy and permissions

## Privacy statement template

Sudoku Candidate Filler does not collect, sell, share, or transmit personal
information. It does not make network requests and does not use remote code.

The extension reads the Sudoku grid already rendered in the browser tab at The
Age, then writes candidate digits into the existing puzzle page. Its only
stored value is whether automatic candidate refreshes are enabled. This value
is saved in browser extension local storage on the user's device.

The extension does not read passwords, payment details, browsing history,
cookies, or authentication tokens. It does not bypass subscription or access
controls.

Before publishing, replace this template with a public, stable privacy-policy
URL required by the selected store.

## Permission rationale

| Manifest entry | Reason | Scope |
| --- | --- | --- |
| `storage` | Saves the user's on/off preference for automatic candidate refreshes. | Browser extension local storage only. |
| `https://www.theage.com.au/puzzles/sudoku/*` | Lets the content script inspect the Sudoku grid and render candidates. | Only The Age Sudoku paths; no other sites. |
| Firefox `data_collection_permissions.required: ["none"]` | Declares that the Firefox build does not require data collection. | Firefox manifest metadata only. |

No optional permissions, broad host patterns, remote scripts, or network
permissions are requested. Review this document whenever the manifest changes;
adding a permission requires both a technical rationale and updated store
disclosures.

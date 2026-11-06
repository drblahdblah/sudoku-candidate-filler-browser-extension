# Sudoku Candidate Filler

A local Chrome extension that automatically shows standard pencil-mark candidates
for The Age Sudoku puzzles.

For each empty cell, it displays every digit that is not already used in that
cell's row, column, or 3×3 box. It recalculates after the puzzle changes.

## Install locally in Chrome

1. Clone this repository or open this folder locally.
2. In Chrome, open `chrome://extensions`.
3. Enable **Developer mode**.
4. Select **Load unpacked** and choose this repository's root folder.
5. Open an authenticated puzzle at
   `https://www.theage.com.au/puzzles/sudoku/...`.
6. The extension fills candidates automatically once the grid has loaded.

When you change a number, start a new puzzle, or return focus to the puzzle,
candidate marks update automatically. Clicking the extension's toolbar icon
also refreshes candidates without opening a popup, so it does not pause the
game.

## Development

This project has no runtime dependencies. Run the candidate-calculation tests
with:

```sh
npm test
```

After editing extension files, use the reload button on the extension's card in
`chrome://extensions`, then refresh the Sudoku page.

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

(function exposeCandidates(root) {
  const GRID_SIZE = 9;
  const BOX_SIZE = 3;
  const DIGITS = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9]);

  function validateGrid(grid) {
    if (!Array.isArray(grid) || grid.length !== GRID_SIZE) {
      throw new TypeError("A Sudoku grid must have exactly nine rows.");
    }

    for (const row of grid) {
      if (!Array.isArray(row) || row.length !== GRID_SIZE) {
        throw new TypeError("Each Sudoku row must have exactly nine cells.");
      }

      for (const value of row) {
        if (!Number.isInteger(value)) {
          throw new TypeError("Sudoku cell values must be integers.");
        }
        if (value < 0 || value > GRID_SIZE) {
          throw new RangeError("Sudoku cell values must be between 0 and 9.");
        }
      }
    }

    for (let index = 0; index < GRID_SIZE; index += 1) {
      assertNoDuplicates(grid[index], `row ${index + 1}`);
      assertNoDuplicates(
        grid.map((row) => row[index]),
        `column ${index + 1}`,
      );
    }

    for (let row = 0; row < GRID_SIZE; row += BOX_SIZE) {
      for (let column = 0; column < GRID_SIZE; column += BOX_SIZE) {
        const values = [];
        for (let rowOffset = 0; rowOffset < BOX_SIZE; rowOffset += 1) {
          for (
            let columnOffset = 0;
            columnOffset < BOX_SIZE;
            columnOffset += 1
          ) {
            values.push(grid[row + rowOffset][column + columnOffset]);
          }
        }
        assertNoDuplicates(values, `box ${row / BOX_SIZE + 1},${column / BOX_SIZE + 1}`);
      }
    }
  }

  function assertNoDuplicates(values, location) {
    const seen = new Set();
    for (const value of values) {
      if (value !== 0 && seen.has(value)) {
        throw new RangeError(`Duplicate ${value} in ${location}.`);
      }
      seen.add(value);
    }
  }

  function calculateCandidates(grid) {
    validateGrid(grid);

    return grid.map((row, rowIndex) =>
      row.map((value, columnIndex) => {
        if (value !== 0) {
          return null;
        }

        const unavailable = new Set(grid[rowIndex]);
        for (let index = 0; index < GRID_SIZE; index += 1) {
          unavailable.add(grid[index][columnIndex]);
        }

        const boxRow = Math.floor(rowIndex / BOX_SIZE) * BOX_SIZE;
        const boxColumn = Math.floor(columnIndex / BOX_SIZE) * BOX_SIZE;
        for (let rowOffset = 0; rowOffset < BOX_SIZE; rowOffset += 1) {
          for (
            let columnOffset = 0;
            columnOffset < BOX_SIZE;
            columnOffset += 1
          ) {
            unavailable.add(grid[boxRow + rowOffset][boxColumn + columnOffset]);
          }
        }

        return DIGITS.filter((digit) => !unavailable.has(digit));
      }),
    );
  }

  const api = Object.freeze({ calculateCandidates, validateGrid });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.SudokuCandidates = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

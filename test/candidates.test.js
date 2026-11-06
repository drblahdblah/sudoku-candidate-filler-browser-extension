const assert = require("node:assert/strict");
const test = require("node:test");

const {
  calculateCandidates,
  validateGrid,
} = require("../src/candidates.js");

const EMPTY_GRID = Array.from({ length: 9 }, () => Array(9).fill(0));

test("calculates standard candidates from row, column, and box constraints", () => {
  const grid = [
    [5, 3, 0, 0, 7, 0, 0, 0, 0],
    [6, 0, 0, 1, 9, 5, 0, 0, 0],
    [0, 9, 8, 0, 0, 0, 0, 6, 0],
    [8, 0, 0, 0, 6, 0, 0, 0, 3],
    [4, 0, 0, 8, 0, 3, 0, 0, 1],
    [7, 0, 0, 0, 2, 0, 0, 0, 6],
    [0, 6, 0, 0, 0, 0, 2, 8, 0],
    [0, 0, 0, 4, 1, 9, 0, 0, 5],
    [0, 0, 0, 0, 8, 0, 0, 7, 9],
  ];

  const candidates = calculateCandidates(grid);

  assert.deepEqual(candidates[0][2], [1, 2, 4]);
  assert.deepEqual(candidates[4][4], [5]);
  assert.equal(candidates[0][0], null);
});

test("returns every digit as a candidate on an empty board", () => {
  const candidates = calculateCandidates(EMPTY_GRID);

  assert.deepEqual(candidates[0][0], [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(candidates[8][8], [1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test("does not mutate the supplied grid or share candidate arrays", () => {
  const grid = EMPTY_GRID.map((row) => [...row]);
  const candidates = calculateCandidates(grid);

  candidates[0][0].pop();

  assert.deepEqual(grid, EMPTY_GRID);
  assert.deepEqual(candidates[0][1], [1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test("rejects malformed and contradictory grids", () => {
  assert.throws(() => validateGrid([]), TypeError);
  assert.throws(
    () => validateGrid(Array.from({ length: 9 }, () => Array(8).fill(0))),
    TypeError,
  );
  assert.throws(
    () => validateGrid([[10, ...Array(8).fill(0)], ...EMPTY_GRID.slice(1)]),
    RangeError,
  );
  assert.throws(
    () => validateGrid([[1, 1, ...Array(7).fill(0)], ...EMPTY_GRID.slice(1)]),
    RangeError,
  );
  assert.throws(
    () =>
      validateGrid([
        [1, ...Array(8).fill(0)],
        [0, 1, ...Array(7).fill(0)],
        ...EMPTY_GRID.slice(2),
      ]),
    RangeError,
  );
});

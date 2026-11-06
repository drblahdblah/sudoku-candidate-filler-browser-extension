const assert = require("node:assert/strict");
const test = require("node:test");

const {
  findPuzzleTable,
  getCandidateSpans,
  getPuzzleCells,
  readCellValue,
  readGrid,
  renderCandidates,
} = require("../src/grid-dom.js");

function createCandidateCell(marks = Array(9).fill("\u00a0")) {
  const spans = marks.map((textContent) => ({ tagName: "SPAN", textContent }));
  const candidateContainer = {
    children: spans,
    className: "erBN0",
    dataset: {},
    cloneNode() {
      return createCandidateContainer();
    },
    remove() {},
  };
  const cell = {
    button: null,
    querySelector(selector) {
      return selector === "button[data-x][data-y]" ? this.button : null;
    },
    querySelectorAll(selector) {
      return selector === "div" ? [candidateContainer] : [];
    },
    spans,
    setCoordinates(x, y) {
      this.button = {
        childNodes: [],
        dataset: { x: String(x), y: String(y) },
        textContent: "",
      };
    },
  };
  return cell;
}

function createCandidateContainer() {
  return {
    children: [],
    className: "erBN0",
    dataset: {},
    style: {},
    append(child) {
      this.children.push(child);
    },
    remove() {},
  };
}

function createCandidateSpan() {
  const attributes = new Map();
  return {
    tagName: "SPAN",
    textContent: "",
    style: {},
    tabIndex: -1,
    setAttribute(name, value) {
      attributes.set(name, value);
    },
    removeAttribute(name) {
      attributes.delete(name);
    },
    getAttribute(name) {
      return attributes.get(name) ?? null;
    },
  };
}

function createEmptyButtonCell(x, y) {
  const containers = [];
  const documentRoot = {
    createElement(tagName) {
      return tagName === "div"
        ? createCandidateContainer()
        : createCandidateSpan();
    },
  };
  const button = {
    dataset: { x: String(x), y: String(y) },
    textContent: "",
  };
  return {
    ownerDocument: documentRoot,
    append(container) {
      containers.push(container);
    },
    querySelector(selector) {
      return selector === "button[data-x][data-y]" ? button : null;
    },
    querySelectorAll(selector) {
      return selector === "div" ? containers : [];
    },
  };
}

function createFilledCell(value, x = 0, y = 0) {
  return {
    querySelector(selector) {
      return selector === "button[data-x][data-y]"
        ? { dataset: { x: String(x), y: String(y) }, textContent: String(value) }
        : null;
    },
    querySelectorAll() {
      return [];
    },
  };
}

function createFilledCellWithCandidates(value, x = 0, y = 0) {
  const candidateContainer = {
    children: Array.from({ length: 9 }, () => ({
      tagName: "SPAN",
      textContent: "1",
    })),
    dataset: { scfCandidates: "true" },
    removed: false,
    remove() {
      this.removed = true;
    },
  };
  return {
    candidateContainer,
    querySelector(selector) {
      return selector === "button[data-x][data-y]"
        ? {
          childNodes: [{ nodeType: 3, textContent: String(value) }],
          dataset: { x: String(x), y: String(y) },
          textContent: String(value),
        }
        : null;
    },
    querySelectorAll(selector) {
      return selector === "div" && !candidateContainer.removed
        ? [candidateContainer]
        : [];
    },
  };
}

function createTable(cells) {
  return {
    rows: cells.map((row) => ({ cells: row })),
  };
}

function addCoordinates(cells, reverse = false) {
  cells.forEach((row, rowIndex) => {
    row.forEach((cell, columnIndex) => {
      cell.setCoordinates?.(
        reverse ? rowIndex : columnIndex,
        reverse ? columnIndex : rowIndex,
      );
    });
  });
}

test("finds a 9x9 Sudoku table and reads filled values without reading marks", () => {
  const cells = Array.from({ length: 9 }, () =>
    Array.from({ length: 9 }, () => createCandidateCell()),
  );
  cells[0][2] = createFilledCell(6, 2, 0);
  addCoordinates(cells);
  const table = createTable(cells);
  const documentRoot = {
    querySelectorAll(selector) {
      return selector === "table" ? [table] : [];
    },
  };

  assert.equal(findPuzzleTable(documentRoot), table);
  assert.deepEqual(getPuzzleCells(table), cells);
  assert.equal(readGrid(cells)[0][2], 6);
  assert.equal(readGrid(cells)[0][0], 0);
});

test("writes only the matching candidate marks to a compatible empty cell", () => {
  const cells = Array.from({ length: 9 }, () =>
    Array.from({ length: 9 }, () => createCandidateCell()),
  );
  cells[0][0].querySelectorAll("div")[0].dataset.scfCandidates = "true";
  const candidates = Array.from({ length: 9 }, () => Array(9).fill(null));
  candidates[0][0] = [2, 4, 5];

  renderCandidates(cells, candidates);

  assert.deepEqual(
    cells[0][0].spans.map((span) => span.textContent),
    ["\u00a0", "2", "\u00a0", "4", "5", "\u00a0", "\u00a0", "\u00a0", "\u00a0"],
  );
  assert.equal(getCandidateSpans(createFilledCell(7)), null);
});

test("preserves manual candidate marks in an empty cell", () => {
  const cells = Array.from({ length: 9 }, () =>
    Array.from({ length: 9 }, () => createCandidateCell()),
  );
  cells[0][0].spans[0].textContent = "1";
  const candidates = Array.from({ length: 9 }, () => Array(9).fill(null));
  candidates[0][0] = [2];

  renderCandidates(cells, candidates);

  assert.equal(cells[0][0].spans[0].textContent, "1");
  assert.equal(cells[0][0].spans[1].textContent, "\u00a0");
});

test("creates owned marks without overwriting an unowned candidate container", () => {
  const unownedSpans = Array.from({ length: 9 }, () => ({
    tagName: "SPAN",
    textContent: "manual",
  }));
  const unownedContainer = {
    children: unownedSpans,
    dataset: {},
    cloneNode() {
      return createCandidateContainer();
    },
  };
  const ownedContainers = [];
  const cell = {
    button: {
      dataset: { x: "0", y: "0" },
      textContent: "",
    },
    ownerDocument: {
      createElement(tagName) {
        return tagName === "div"
          ? createCandidateContainer()
          : { tagName: "SPAN", textContent: "" };
      },
    },
    append(container) {
      ownedContainers.push(container);
    },
    querySelector(selector) {
      return selector === "button[data-x][data-y]" ? this.button : null;
    },
    querySelectorAll(selector) {
      return selector === "div" ? [unownedContainer, ...ownedContainers] : [];
    },
  };
  const cells = Array.from({ length: 9 }, () =>
    Array.from({ length: 9 }, () => createCandidateCell()),
  );
  cells[0][0] = cell;
  const candidates = Array.from({ length: 9 }, () => Array(9).fill(null));
  candidates[0][0] = [2, 4];

  renderCandidates(cells, candidates);

  assert.deepEqual(
    unownedSpans.map((span) => span.textContent),
    Array(9).fill("manual"),
  );
  assert.deepEqual(
    ownedContainers[0].children.map((span) => span.textContent),
    ["\u00a0", "2", "\u00a0", "4", "\u00a0", "\u00a0", "\u00a0", "\u00a0", "\u00a0"],
  );
});

test("creates a native-style candidate container for an empty button without one", () => {
  const cells = Array.from({ length: 9 }, () =>
    Array.from({ length: 9 }, () => createCandidateCell()),
  );
  cells[0][0] = createEmptyButtonCell(0, 0);
  const candidates = Array.from({ length: 9 }, () => Array(9).fill(null));
  candidates[0][0] = [1, 3, 9];

  renderCandidates(cells, candidates);

  assert.deepEqual(
    getCandidateSpans(cells[0][0]).map((span) => span.textContent),
    ["1", "\u00a0", "3", "\u00a0", "\u00a0", "\u00a0", "\u00a0", "\u00a0", "9"],
  );
});

test("enables pointer and keyboard interaction only on visible owned candidate marks", () => {
  const cells = Array.from({ length: 9 }, () =>
    Array.from({ length: 9 }, () => createCandidateCell()),
  );
  cells[0][0] = createEmptyButtonCell(0, 0);
  const candidates = Array.from({ length: 9 }, () => Array(9).fill(null));
  candidates[0][0] = [1, 3, 9];

  renderCandidates(cells, candidates);

  const [container] = cells[0][0].querySelectorAll("div");
  assert.equal(container.style.pointerEvents, "none");
  for (const [index, span] of container.children.entries()) {
    const isActive = [1, 3, 9].includes(index + 1);
    assert.equal(span.style.pointerEvents, isActive ? "auto" : "none");
    assert.equal(span.style.cursor, isActive ? "pointer" : "");
    assert.equal(span.tabIndex, isActive ? 0 : -1);
    assert.equal(span.getAttribute("role"), isActive ? "button" : null);
    assert.equal(
      span.getAttribute("aria-label"),
      isActive ? `Eliminate candidate ${index + 1}` : null,
    );
  }
});

test("does not read a single candidate inside a button as a solved cell value", () => {
  const candidateOnlyCell = {
    querySelector(selector) {
      return selector === "button[data-x][data-y]"
        ? {
          childNodes: [{ nodeType: 1, textContent: "5" }],
          textContent: "5",
        }
        : null;
    },
  };
  const fixedValueCell = {
    querySelector(selector) {
      return selector === "button[data-x][data-y]"
        ? {
          childNodes: [{ nodeType: 3, textContent: "6" }],
          textContent: "6",
        }
        : null;
    },
  };

  assert.equal(readCellValue(candidateOnlyCell), 0);
  assert.equal(readCellValue(fixedValueCell), 6);
});

test("removes stale candidate markup from a solved cell", () => {
  const cells = Array.from({ length: 9 }, () =>
    Array.from({ length: 9 }, () => createCandidateCell()),
  );
  cells[0][0] = createFilledCellWithCandidates(6, 0, 0);
  const candidates = Array.from({ length: 9 }, () => Array(9).fill(null));

  renderCandidates(cells, candidates);

  assert.equal(cells[0][0].candidateContainer.removed, true);
});

test("preserves an unowned candidate container in a solved cell", () => {
  const cells = Array.from({ length: 9 }, () =>
    Array.from({ length: 9 }, () => createCandidateCell()),
  );
  const solvedCell = createFilledCellWithCandidates(6, 0, 0);
  solvedCell.candidateContainer.dataset = {};
  cells[0][0] = solvedCell;
  const candidates = Array.from({ length: 9 }, () => Array(9).fill(null));

  renderCandidates(cells, candidates);

  assert.equal(solvedCell.candidateContainer.removed, false);
});

test("does not treat a non-9-cell table or non-span markup as a Sudoku grid", () => {
  const invalidCell = {
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [{ children: Array(9).fill({ tagName: "DIV" }) }];
    },
  };
  const invalidTable = {
    rows: Array.from({ length: 8 }, () => ({
      cells: Array.from({ length: 9 }, () => invalidCell),
    })),
  };

  assert.equal(getPuzzleCells(invalidTable), null);
  assert.equal(getCandidateSpans(invalidCell), null);
});

test("does not select a coordinate-free table that only resembles a Sudoku grid", () => {
  const table = createTable(
    Array.from({ length: 9 }, () =>
      Array.from({ length: 9 }, () => createCandidateCell()),
    ),
  );
  const documentRoot = {
    querySelectorAll() {
      return [table];
    },
  };

  assert.equal(findPuzzleTable(documentRoot), undefined);
});

test("accepts valid cell coordinates regardless of their row-column orientation", () => {
  const cells = Array.from({ length: 9 }, () =>
    Array.from({ length: 9 }, () => createCandidateCell()),
  );
  cells[0][2] = createFilledCell(6, 0, 2);
  addCoordinates(cells, true);
  const table = createTable(cells);
  const documentRoot = {
    querySelectorAll() {
      return [table];
    },
  };

  assert.equal(findPuzzleTable(documentRoot), table);
});

test("rejects malformed cell coordinate values", () => {
  const cells = Array.from({ length: 9 }, () =>
    Array.from({ length: 9 }, () => createCandidateCell()),
  );
  cells[0][2] = createFilledCell(6, "2junk", 0);
  addCoordinates(cells);
  const table = createTable(cells);
  const documentRoot = {
    querySelectorAll() {
      return [table];
    },
  };

  assert.equal(findPuzzleTable(documentRoot), undefined);
});

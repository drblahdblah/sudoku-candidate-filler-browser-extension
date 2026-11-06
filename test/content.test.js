const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const SudokuCandidates = require("../src/candidates.js");
const SudokuGridDom = require("../src/grid-dom.js");

function createCandidateCell() {
  const spans = Array.from({ length: 9 }, () => ({
    tagName: "SPAN",
    textContent: "\u00a0",
  }));
  let candidateContainer = {
    children: spans,
    dataset: { scfCandidates: "true" },
    removed: false,
    remove() {
      this.removed = true;
    },
  };
  const cell = {
    button: null,
    spans,
    querySelector(selector) {
      return selector === "button[data-x][data-y]" ? this.button : null;
    },
    querySelectorAll(selector) {
      return selector === "div" && !candidateContainer.removed
        ? [candidateContainer]
        : [];
    },
    setCoordinates(x, y) {
      this.button = {
        childNodes: [],
        dataset: { x: String(x), y: String(y) },
        textContent: "",
      };
    },
    setValue(value) {
      this.button.childNodes = [{ nodeType: 3, textContent: String(value) }];
      this.button.textContent = String(value);
    },
    replaceCandidateSpans(marks) {
      candidateContainer.children = marks.map((textContent) => ({
        tagName: "SPAN",
        textContent,
      }));
      return candidateContainer.children;
    },
    replaceCandidateContainer(marks) {
      const removedContainer = candidateContainer;
      candidateContainer = {
        children: marks.map((textContent) => ({
          tagName: "SPAN",
          textContent,
        })),
        dataset: { scfCandidates: "true" },
        removed: false,
        remove() {
          this.removed = true;
        },
      };
      this.spans = candidateContainer.children;
      removedContainer.removed = true;
      return { removedContainer, replacementSpans: candidateContainer.children };
    },
  };
  return cell;
}

function createFilledCell(value, x, y) {
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

function createContentEnvironment({
  getFails = false,
  setFails = false,
  runTimersImmediately = true,
} = {}) {
  const cells = Array.from({ length: 9 }, () =>
    Array.from({ length: 9 }, createCandidateCell),
  );
  cells[0][0] = createFilledCell(1, 0, 0);
  cells.forEach((row, rowIndex) => {
    row.forEach((cell, columnIndex) => {
      cell.setCoordinates?.(columnIndex, rowIndex);
    });
  });
  const table = { rows: cells.map((row) => ({ cells: row })), isConnected: true };
  let activeTable = table;
  const observers = [];
  const documentListeners = {};
  const messageListeners = [];
  const storageListeners = [];
  const timers = [];
  const intervals = [];
  const candidateCalculationCalls = [];
  const windowListeners = {};
  const location = { href: "https://example.test/puzzle" };

  class FakeMutationObserver {
    constructor(callback) {
      this.callback = callback;
      observers.push(this);
    }

    observe(target) {
      this.target = target;
    }

    disconnect() {}
  }

  const chrome = {
    runtime: {
      onMessage: {
        addListener(listener) {
          messageListeners.push(listener);
        },
      },
    },
    storage: {
      local: {
        get() {
          return getFails ? Promise.reject(new Error("storage unavailable")) : Promise.resolve({
            candidateFillerEnabled: true,
          });
        },
        set() {
          return setFails ? Promise.reject(new Error("storage unavailable")) : Promise.resolve();
        },
      },
      onChanged: {
        addListener(listener) {
          storageListeners.push(listener);
        },
      },
    },
  };
  const documentRoot = {
    documentElement: {},
    addEventListener(type, listener) {
      documentListeners[type] = listener;
    },
    querySelectorAll(selector) {
      return selector === "table" ? [activeTable] : [];
    },
  };
  const context = {
    MutationObserver: FakeMutationObserver,
    SudokuCandidates: {
      calculateCandidates(grid) {
        candidateCalculationCalls.push(grid);
        return SudokuCandidates.calculateCandidates(grid);
      },
    },
    SudokuGridDom,
    chrome,
    documentListeners,
    console,
    document: documentRoot,
    location,
    window: {
      addEventListener(type, listener) {
        windowListeners[type] = listener;
      },
      location,
      queueMicrotask,
      setTimeout(callback, delay) {
        timers.push({ callback, delay });
        if (runTimersImmediately) {
          callback();
        }
        return timers.length;
      },
      setInterval(callback, delay) {
        intervals.push({ callback, delay });
        return intervals.length;
      },
    },
  };
  context.globalThis = context;

  const source = fs.readFileSync(
    path.join(__dirname, "../src/content.js"),
    "utf8",
  );
  vm.runInNewContext(source, context);

  function replacePuzzle(value) {
    table.isConnected = false;
    const nextCells = Array.from({ length: 9 }, () =>
      Array.from({ length: 9 }, createCandidateCell),
    );
    nextCells[0][0] = createFilledCell(value, 0, 0);
    nextCells.forEach((row, rowIndex) => {
      row.forEach((cell, columnIndex) => {
        cell.setCoordinates?.(columnIndex, rowIndex);
      });
    });
    activeTable = {
      isConnected: true,
      rows: nextCells.map((row) => ({ cells: row })),
    };
    return nextCells;
  }

  function runPendingTimers() {
    const pendingTimers = timers.splice(0).sort((left, right) => left.delay - right.delay);
    for (const timer of pendingTimers) {
      timer.callback();
    }
  }

  return {
    cells,
    candidateCalculationCalls,
    chrome,
    documentListeners,
    documentRoot,
    intervals,
    location,
    messageListeners,
    observers,
    replacePuzzle,
    runPendingTimers,
    storageListeners,
    table,
    timers,
    windowListeners,
  };
}

function sendMessage(listener, message) {
  return new Promise((resolve) => {
    listener(message, {}, resolve);
  });
}

function getTableObserver(environment) {
  return environment.observers.find(
    (observer) => observer.target === environment.table,
  );
}

test("content script fills marks and responds to extension commands", async () => {
  const environment = createContentEnvironment();
  await new Promise(queueMicrotask);

  assert.equal(environment.cells[0][1].spans[0].textContent, "\u00a0");
  assert.equal(environment.cells[0][1].spans[1].textContent, "2");

  const listener = environment.messageListeners[0];
  const status = await sendMessage(listener, { type: "get-status" });
  assert.deepEqual({ ...status }, {
    enabled: true,
    status: "Candidates are up to date.",
  });

  const disabled = await sendMessage(listener, {
    type: "set-enabled",
    enabled: false,
  });
  assert.deepEqual({ ...disabled }, {
    enabled: false,
    ok: true,
    status: "Automatic candidates are disabled.",
  });
});

test("content script returns a safe response when saving settings fails", async () => {
  const environment = createContentEnvironment({ setFails: true });
  await new Promise(queueMicrotask);

  const response = await sendMessage(environment.messageListeners[0], {
    type: "set-enabled",
    enabled: false,
  });

  assert.deepEqual({ ...response }, {
    enabled: true,
    ok: false,
    status: "Could not save the extension setting.",
  });
});

test("content script keeps working when the initial settings read fails", async () => {
  const environment = createContentEnvironment({ getFails: true });
  await new Promise(queueMicrotask);
  await new Promise(queueMicrotask);

  const response = await sendMessage(environment.messageListeners[0], {
    type: "fill",
  });

  assert.deepEqual({ ...response }, {
    ok: true,
    status: "Candidates are up to date.",
  });
});

test("content script discovers and fills a replacement puzzle table", async () => {
  const environment = createContentEnvironment();
  await new Promise(queueMicrotask);
  const nextCells = environment.replacePuzzle(2);
  const discoveryObserver = environment.observers.find(
    (observer) => observer.target === environment.documentRoot.documentElement,
  );

  discoveryObserver.callback([]);

  assert.equal(nextCells[0][1].spans[1].textContent, "\u00a0");
  assert.equal(nextCells[0][1].spans[2].textContent, "3");
  assert.equal(typeof environment.windowListeners.focus, "function");
});

test("content script refreshes repeatedly after the paused-game Continue button", async () => {
  const environment = createContentEnvironment({ runTimersImmediately: false });
  await new Promise(queueMicrotask);
  environment.runPendingTimers();
  environment.candidateCalculationCalls.length = 0;
  const nextCells = environment.replacePuzzle(2);

  environment.documentListeners.click({
    target: {
      closest(selector) {
        return selector === "button" ? { textContent: " CONTINUE " } : null;
      },
    },
  });

  assert.deepEqual(
    environment.timers.map((timer) => timer.delay),
    [50, 0, 100, 300, 750, 1500],
  );
  environment.runPendingTimers();

  assert.equal(environment.candidateCalculationCalls.length, 6);
  assert.equal(nextCells[0][1].spans[1].textContent, "\u00a0");
  assert.equal(nextCells[0][1].spans[2].textContent, "3");
});

test("content script preserves a manually removed owned candidate after refreshes", async () => {
  const environment = createContentEnvironment();
  await new Promise(queueMicrotask);
  const manuallyRemovedMark = environment.cells[0][1].spans[1];
  manuallyRemovedMark.textContent = "\u00a0";

  getTableObserver(environment).callback([{ target: manuallyRemovedMark }]);
  assert.equal(manuallyRemovedMark.textContent, "\u00a0");

  await sendMessage(environment.messageListeners[0], { type: "fill" });
  assert.equal(manuallyRemovedMark.textContent, "\u00a0");
  assert.equal(environment.cells[0][1].spans[2].textContent, "3");
});

test("content script recalculates standard candidates after a solved-value update", async () => {
  const environment = createContentEnvironment();
  await new Promise(queueMicrotask);
  const solvedCell = environment.cells[0][1];
  solvedCell.setValue(2);

  getTableObserver(environment).callback([{ target: solvedCell.button }]);

  assert.equal(environment.cells[0][2].spans[1].textContent, "\u00a0");
  assert.equal(environment.cells[0][2].spans[2].textContent, "3");
});

test("content script reapplies manual exclusions after candidate spans are replaced", async () => {
  const environment = createContentEnvironment();
  await new Promise(queueMicrotask);
  const cell = environment.cells[0][1];
  cell.spans[1].textContent = "\u00a0";
  const observer = getTableObserver(environment);
  observer.callback([{ target: cell.spans[1] }]);

  const replacementSpans = cell.replaceCandidateSpans(
    Array.from({ length: 9 }, (_, index) =>
      index === 0 ? "\u00a0" : String(index + 1),
    ),
  );
  observer.callback([{ target: cell }]);

  assert.equal(replacementSpans[1].textContent, "\u00a0");
  assert.equal(replacementSpans[2].textContent, "3");
});

test("content script remembers a removal when React replaces its owned container", async () => {
  const environment = createContentEnvironment();
  await new Promise(queueMicrotask);
  const cell = environment.cells[0][1];
  const observer = getTableObserver(environment);
  cell.spans[1].textContent = "\u00a0";
  const { removedContainer, replacementSpans } = cell.replaceCandidateContainer(
    Array.from({ length: 9 }, (_, index) =>
      index === 0 ? "\u00a0" : String(index + 1),
    ),
  );

  observer.callback([{ target: cell, removedNodes: [removedContainer] }]);

  assert.equal(replacementSpans[1].textContent, "\u00a0");
  assert.equal(replacementSpans[2].textContent, "3");
});

test("content script resets manual exclusions for a replacement puzzle", async () => {
  const environment = createContentEnvironment();
  await new Promise(queueMicrotask);
  const cell = environment.cells[0][1];
  cell.spans[1].textContent = "\u00a0";
  getTableObserver(environment).callback([{ target: cell.spans[1] }]);

  const nextCells = environment.replacePuzzle(1);
  environment.observers.find(
    (observer) => observer.target === environment.documentRoot.documentElement,
  ).callback([]);

  assert.equal(nextCells[0][1].spans[1].textContent, "2");
});

test("content script resets retained-grid exclusions when the route URL changes", async () => {
  const environment = createContentEnvironment({ runTimersImmediately: false });
  await new Promise(queueMicrotask);
  environment.runPendingTimers();
  assert.deepEqual(
    environment.intervals.map((interval) => interval.delay),
    [250],
  );
  const cell = environment.cells[0][1];
  const observer = getTableObserver(environment);
  const removeCandidate = () => {
    cell.spans[1].textContent = "\u00a0";
    observer.callback([{ target: cell.spans[1] }]);
    environment.runPendingTimers();
    assert.equal(cell.spans[1].textContent, "\u00a0");
  };
  const navigate = (url, notify) => {
    removeCandidate();
    environment.location.href = url;
    notify();
    assert.deepEqual(environment.timers.map((timer) => timer.delay), [50]);
    environment.runPendingTimers();
    assert.equal(cell.spans[1].textContent, "2");
  };

  navigate(
    "https://example.test/push",
    () => environment.intervals[0].callback(),
  );
  navigate(
    "https://example.test/back",
    () => environment.windowListeners.popstate(),
  );
  navigate(
    "https://example.test/back#notes",
    () => environment.windowListeners.hashchange(),
  );
});

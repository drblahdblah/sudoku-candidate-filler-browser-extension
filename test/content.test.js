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
    dataset: {},
    style: {},
  }));
  let candidateContainer = {
    children: spans,
    dataset: { scfCandidates: "true" },
    style: {},
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
        className: "",
        dataset: { x: String(x), y: String(y) },
        textContent: "",
        getAttribute(name) {
          return this[name] ?? null;
        },
      };
    },
    select() {
      this.button["aria-selected"] = "true";
    },
    setValue(value) {
      this.button.childNodes = [{ nodeType: 3, textContent: String(value) }];
      this.button.textContent = String(value);
    },
    replaceCandidateSpans(marks) {
      candidateContainer.children = marks.map((textContent) => ({
        tagName: "SPAN",
        textContent,
        dataset: {},
        style: {},
      }));
      return candidateContainer.children;
    },
    replaceCandidateContainer(marks) {
      const removedContainer = candidateContainer;
      candidateContainer = {
        children: marks.map((textContent) => ({
          tagName: "SPAN",
          textContent,
          dataset: {},
          style: {},
        })),
        dataset: { scfCandidates: "true" },
        style: {},
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
    activeElement: null,
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
      clearTimeout(timerId) {
        const index = timerId - 1;
        if (index >= 0 && index < timers.length) {
          timers[index] = { callback() {}, delay: timers[index].delay };
        }
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

test("content script ignores plain clicks on owned candidates so the page keeps cell input", async () => {
  const environment = createContentEnvironment();
  await new Promise(queueMicrotask);
  const candidateMark = environment.cells[0][1].spans[1];
  const click = {
    altKey: false,
    target: candidateMark,
    prevented: false,
    stopped: false,
    preventDefault() {
      this.prevented = true;
    },
    stopImmediatePropagation() {
      this.stopped = true;
    },
    stopPropagation() {},
    closest() {
      return null;
    },
  };

  environment.documentListeners.click(click);
  assert.equal(click.prevented, false);
  assert.equal(click.stopped, false);
  assert.equal(candidateMark.textContent, "2");
});

test("content script eliminates an owned candidate with Option/Alt-click and leaves its blank slot alone", async () => {
  const environment = createContentEnvironment();
  await new Promise(queueMicrotask);
  const candidateMark = environment.cells[0][1].spans[1];
  const click = {
    altKey: true,
    target: candidateMark,
    prevented: false,
    stopped: false,
    preventDefault() {
      this.prevented = true;
    },
    stopImmediatePropagation() {
      this.stopped = true;
    },
    stopPropagation() {},
  };

  environment.documentListeners.click(click);
  assert.equal(click.prevented, true);
  assert.equal(click.stopped, true);
  assert.equal(candidateMark.textContent, "\u00a0");

  await sendMessage(environment.messageListeners[0], { type: "fill" });
  assert.equal(candidateMark.textContent, "\u00a0");
  assert.equal(environment.cells[0][1].spans[2].textContent, "3");

  const blankSlotClick = {
    altKey: true,
    target: candidateMark,
    prevented: false,
    stopped: false,
    preventDefault() {
      this.prevented = true;
    },
    stopImmediatePropagation() {
      this.stopped = true;
    },
    stopPropagation() {},
  };
  environment.documentListeners.click(blankSlotClick);
  assert.equal(blankSlotClick.prevented, false);
  assert.equal(blankSlotClick.stopped, false);
  assert.equal(candidateMark.textContent, "\u00a0");
});

test("content script restores the last Option/Alt elimination from Undo", async () => {
  const environment = createContentEnvironment();
  await new Promise(queueMicrotask);
  const candidateMark = environment.cells[0][1].spans[1];

  environment.documentListeners.click({
    altKey: true,
    target: candidateMark,
    preventDefault() {},
    stopImmediatePropagation() {},
    stopPropagation() {},
  });
  assert.equal(candidateMark.textContent, "\u00a0");

  const undoButton = {
    textContent: "Undo",
    getAttribute() {
      return null;
    },
  };
  const undoClick = {
    altKey: false,
    target: {
      closest(selector) {
        return selector.includes("button") ? undoButton : null;
      },
    },
    prevented: false,
    stopped: false,
    preventDefault() {
      this.prevented = true;
    },
    stopImmediatePropagation() {
      this.stopped = true;
    },
    stopPropagation() {},
  };

  environment.documentListeners.click(undoClick);
  assert.equal(undoClick.prevented, true);
  assert.equal(undoClick.stopped, true);
  assert.equal(environment.cells[0][1].spans[1].textContent, "2");
});

test("content script does not intercept unowned candidate marks", async () => {
  const environment = createContentEnvironment();
  await new Promise(queueMicrotask);
  const nativeCandidate = {
    textContent: "2",
    closest() {
      return null;
    },
  };
  const click = {
    altKey: true,
    target: nativeCandidate,
    prevented: false,
    stopped: false,
    preventDefault() {
      this.prevented = true;
    },
    stopImmediatePropagation() {
      this.stopped = true;
    },
    stopPropagation() {},
  };

  environment.documentListeners.click(click);

  assert.equal(click.prevented, false);
  assert.equal(click.stopped, false);
  assert.equal(environment.cells[0][1].spans[1].textContent, "2");

  const keydown = {
    altKey: true,
    key: "Enter",
    target: nativeCandidate,
    prevented: false,
    stopped: false,
    preventDefault() {
      this.prevented = true;
    },
    stopImmediatePropagation() {
      this.stopped = true;
    },
    stopPropagation() {},
  };
  environment.documentListeners.keydown(keydown);
  assert.equal(keydown.prevented, false);
  assert.equal(keydown.stopped, false);
});

function clickPuzzleCell(environment, cell) {
  environment.documentListeners.click({
    target: {
      closest(selector) {
        return selector === "button[data-x][data-y]" ? cell.button : null;
      },
    },
    preventDefault() {},
    stopImmediatePropagation() {},
    stopPropagation() {},
  });
}

function clickKeypadDigit(environment, digit) {
  const keypad = {
    textContent: String(digit),
    dataset: {},
    closest(selector) {
      return selector.includes("button") ? this : null;
    },
  };
  environment.documentListeners.click({
    target: keypad,
    closest(selector) {
      return keypad.closest(selector);
    },
    preventDefault() {},
    stopImmediatePropagation() {},
    stopPropagation() {},
  });
}

test("content script toggles a candidate from pencil-mode keypad input", async () => {
  const environment = createContentEnvironment({ runTimersImmediately: false });
  await new Promise(queueMicrotask);
  environment.runPendingTimers();
  const cell = environment.cells[0][1];
  clickPuzzleCell(environment, cell);
  environment.runPendingTimers();

  clickKeypadDigit(environment, 2);
  environment.runPendingTimers();

  assert.equal(cell.spans[1].textContent, "\u00a0");
  assert.equal(cell.spans[2].textContent, "3");

  clickKeypadDigit(environment, 2);
  environment.runPendingTimers();
  assert.equal(cell.spans[1].textContent, "2");
});

test("content script toggles a candidate from pencil-mode keyboard input", async () => {
  const environment = createContentEnvironment({ runTimersImmediately: false });
  await new Promise(queueMicrotask);
  environment.runPendingTimers();
  const cell = environment.cells[0][1];
  clickPuzzleCell(environment, cell);
  environment.runPendingTimers();
  cell.select();
  environment.documentRoot.activeElement = cell.button;

  environment.documentListeners.keydown({
    key: "3",
    preventDefault() {},
    stopImmediatePropagation() {},
    stopPropagation() {},
  });
  environment.runPendingTimers();

  assert.equal(cell.spans[2].textContent, "\u00a0");
  assert.equal(cell.spans[1].textContent, "2");
});

test("content script prefers live aria-selected over a remembered cell", async () => {
  const environment = createContentEnvironment({ runTimersImmediately: false });
  await new Promise(queueMicrotask);
  environment.runPendingTimers();
  const remembered = environment.cells[0][1];
  const live = environment.cells[0][2];
  clickPuzzleCell(environment, remembered);
  environment.runPendingTimers();
  live.select();

  environment.documentListeners.keydown({
    key: "4",
    preventDefault() {},
    stopImmediatePropagation() {},
    stopPropagation() {},
  });
  environment.runPendingTimers();

  assert.equal(remembered.spans[3].textContent, "4");
  assert.equal(live.spans[3].textContent, "\u00a0");
});

test("content script undoes a pencil restore by re-hiding the candidate", async () => {
  const environment = createContentEnvironment({ runTimersImmediately: false });
  await new Promise(queueMicrotask);
  environment.runPendingTimers();
  const cell = environment.cells[0][1];
  clickPuzzleCell(environment, cell);
  environment.runPendingTimers();

  clickKeypadDigit(environment, 2);
  environment.runPendingTimers();
  assert.equal(cell.spans[1].textContent, "\u00a0");
  clickKeypadDigit(environment, 2);
  environment.runPendingTimers();
  assert.equal(cell.spans[1].textContent, "2");

  const undoButton = {
    textContent: "Undo",
    getAttribute() {
      return null;
    },
  };
  environment.documentListeners.click({
    altKey: false,
    target: {
      closest(selector) {
        return selector.includes("button") ? undoButton : null;
      },
    },
    preventDefault() {},
    stopImmediatePropagation() {},
    stopPropagation() {},
  });
  environment.runPendingTimers();
  assert.equal(cell.spans[1].textContent, "\u00a0");
});

test("content script leaves candidates alone when a digit places a full number", async () => {
  const environment = createContentEnvironment({ runTimersImmediately: false });
  await new Promise(queueMicrotask);
  environment.runPendingTimers();
  const cell = environment.cells[0][1];
  cell.select();

  clickPuzzleCell(environment, cell);
  environment.runPendingTimers();
  clickKeypadDigit(environment, 2);

  cell.setValue(2);
  environment.runPendingTimers();

  cell.button.childNodes = [];
  cell.button.textContent = "";
  await sendMessage(environment.messageListeners[0], { type: "fill" });

  assert.equal(cell.spans[1].textContent, "2");
  assert.equal(cell.spans[2].textContent, "3");
});

test("content script eliminates an owned candidate from geometric Option/Alt-click", async () => {
  const environment = createContentEnvironment();
  await new Promise(queueMicrotask);
  const cell = environment.cells[0][1];
  const candidateMark = cell.spans[1];
  candidateMark.getBoundingClientRect = () => ({
    left: 10,
    right: 20,
    top: 10,
    bottom: 20,
  });
  cell.spans[2].getBoundingClientRect = () => ({
    left: 30,
    right: 40,
    top: 10,
    bottom: 20,
  });

  const click = {
    altKey: true,
    clientX: 15,
    clientY: 15,
    target: cell.button,
    prevented: false,
    stopped: false,
    preventDefault() {
      this.prevented = true;
    },
    stopImmediatePropagation() {
      this.stopped = true;
    },
    stopPropagation() {},
    closest() {
      return null;
    },
  };

  environment.documentListeners.click(click);
  assert.equal(click.prevented, true);
  assert.equal(click.stopped, true);
  assert.equal(candidateMark.textContent, "\u00a0");
  assert.equal(cell.spans[2].textContent, "3");
});

test("content script leaves page Undo alone after a real grid change", async () => {
  const environment = createContentEnvironment();
  await new Promise(queueMicrotask);
  const candidateMark = environment.cells[0][1].spans[1];

  environment.documentListeners.click({
    altKey: true,
    target: candidateMark,
    preventDefault() {},
    stopImmediatePropagation() {},
    stopPropagation() {},
  });
  assert.equal(candidateMark.textContent, "\u00a0");

  environment.cells[0][1].setValue(2);
  getTableObserver(environment).callback([{ target: environment.cells[0][1].button }]);

  const undoButton = {
    textContent: "Undo",
    getAttribute() {
      return null;
    },
  };
  const undoClick = {
    altKey: false,
    target: {
      closest(selector) {
        return selector.includes("button") ? undoButton : null;
      },
    },
    prevented: false,
    stopped: false,
    preventDefault() {
      this.prevented = true;
    },
    stopImmediatePropagation() {
      this.stopped = true;
    },
    stopPropagation() {},
  };

  environment.documentListeners.click(undoClick);
  assert.equal(undoClick.prevented, false);
  assert.equal(undoClick.stopped, false);
});

test("content script recalculates standard candidates after a solved-value update", async () => {
  const environment = createContentEnvironment();
  await new Promise(queueMicrotask);
  const solvedCell = environment.cells[0][1];
  const click = {
    target: solvedCell.button,
    prevented: false,
    stopped: false,
    preventDefault() {
      this.prevented = true;
    },
    stopImmediatePropagation() {
      this.stopped = true;
    },
    stopPropagation() {},
  };

  environment.documentListeners.click(click);
  assert.equal(click.prevented, false);
  assert.equal(click.stopped, false);

  solvedCell.setValue(2);

  getTableObserver(environment).callback([{ target: solvedCell.button }]);

  assert.equal(environment.cells[0][2].spans[1].textContent, "\u00a0");
  assert.equal(environment.cells[0][2].spans[2].textContent, "3");
});

test("content script reapplies manual exclusions after candidate spans are replaced", async () => {
  const environment = createContentEnvironment();
  await new Promise(queueMicrotask);
  const cell = environment.cells[0][1];
  environment.documentListeners.click({ altKey: true, target: cell.spans[1] });
  const observer = getTableObserver(environment);

  const replacementSpans = cell.replaceCandidateSpans(
    Array.from({ length: 9 }, (_, index) =>
      index === 0 ? "\u00a0" : String(index + 1),
    ),
  );
  observer.callback([{ target: cell }]);

  assert.equal(replacementSpans[1].textContent, "\u00a0");
  assert.equal(replacementSpans[2].textContent, "3");
});

test("content script reapplies a click exclusion when React replaces its owned container", async () => {
  const environment = createContentEnvironment();
  await new Promise(queueMicrotask);
  const cell = environment.cells[0][1];
  const observer = getTableObserver(environment);
  environment.documentListeners.click({ altKey: true, target: cell.spans[1] });
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
  environment.documentListeners.click({ altKey: true, target: cell.spans[1] });

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
    environment.documentListeners.click({ altKey: true, target: cell.spans[1] });
    observer.callback([{ target: cell }]);
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

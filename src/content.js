(() => {
  const ENABLED_KEY = "candidateFillerEnabled";
  const CONTINUE_REFRESH_DELAYS = [0, 100, 300, 750, 1500];
  const ROUTE_CHECK_INTERVAL_MS = 250;
  const state = {
    enabled: true,
    puzzleTable: null,
    renderedSpans: null,
    renderedCandidateMarks: new Map(),
    renderedCandidateSpans: new WeakMap(),
    candidateHitTargets: [],
    manualExclusions: new Map(),
    exclusionUndoStack: [],
    trackedPencilMode: false,
    armedDigit: null,
    lastSelectedCellKey: null,
    lastAction: null,
    gridFingerprint: null,
    puzzleLocation: null,
    scheduled: false,
    lastStatus: "Waiting for a Sudoku grid.",
  };
  let tableObserver;
  let discoveryObserver;

  function resetCandidateState() {
    state.renderedCandidateMarks = new Map();
    state.renderedCandidateSpans = new WeakMap();
    state.candidateHitTargets = [];
    state.manualExclusions = new Map();
    state.exclusionUndoStack = [];
    state.trackedPencilMode = false;
    state.armedDigit = null;
    state.lastSelectedCellKey = null;
    state.lastAction = null;
    state.gridFingerprint = null;
  }

  function isPencilModeActive() {
    return globalThis.SudokuAgeUi.isAgePencilModeActive(
      document,
      state.trackedPencilMode,
    );
  }

  function syncTrackedPencilModeFromDom() {
    const control = globalThis.SudokuAgeUi.findPencilModeControl(document);
    if (!control) {
      return state.trackedPencilMode;
    }
    const pressed = globalThis.SudokuAgeUi.readPressedAttribute(control);
    if (pressed != null) {
      state.trackedPencilMode = pressed;
    }
    return state.trackedPencilMode;
  }

  function handlePencilModeButtonClick(event) {
    const control = event.target?.closest?.("button, [role='button']");
    if (!globalThis.SudokuAgeUi.isPencilModeControl(control)) {
      return false;
    }

    // Capture-phase click: flip tracked state, then sync if aria-pressed exists.
    state.trackedPencilMode = !state.trackedPencilMode;
    if (!state.trackedPencilMode) {
      state.armedDigit = null;
    }
    window.setTimeout(() => {
      syncTrackedPencilModeFromDom();
      if (!isPencilModeActive()) {
        state.armedDigit = null;
      }
    }, 0);
    return true;
  }

  function getCellKey(cell) {
    const button = cell.querySelector("button[data-x][data-y]");
    const { x, y } = button?.dataset ?? {};
    return /^[0-8]$/.test(x) && /^[0-8]$/.test(y) ? `${x},${y}` : null;
  }

  function findCellByKey(cells, key) {
    for (const row of cells) {
      for (const cell of row) {
        if (getCellKey(cell) === key) {
          return cell;
        }
      }
    }
    return null;
  }

  function resolveSelectedCell(cells, { allowRemembered = true } = {}) {
    for (const row of cells) {
      for (const cell of row) {
        const button = cell.querySelector("button[data-x][data-y]");
        if (button?.getAttribute?.("aria-selected") === "true") {
          state.lastSelectedCellKey = getCellKey(cell);
          return cell;
        }
      }
    }

    const active = globalThis.document?.activeElement;
    if (active) {
      for (const row of cells) {
        for (const cell of row) {
          const button = cell.querySelector("button[data-x][data-y]");
          if (button === active || cell.contains?.(active)) {
            state.lastSelectedCellKey = getCellKey(cell);
            return cell;
          }
        }
      }
    }

    if (!allowRemembered) {
      return null;
    }

    // Keyboard digit entry usually happens after focus left the grid; fall back
    // to the last cell the player explicitly selected with a grid click.
    return state.lastSelectedCellKey
      ? findCellByKey(cells, state.lastSelectedCellKey)
      : null;
  }

  function rememberSelectedCellFromEvent(event) {
    const button = event.target?.closest?.("button[data-x][data-y]");
    if (!button || !state.puzzleTable) {
      return;
    }

    const cells = globalThis.SudokuGridDom.getPuzzleCells(state.puzzleTable);
    if (!cells) {
      return;
    }

    for (const row of cells) {
      for (const cell of row) {
        if (cell.querySelector("button[data-x][data-y]") === button) {
          state.lastSelectedCellKey = getCellKey(cell);
          return;
        }
      }
    }
  }

  function pruneExclusionsForFilledCells(cells) {
    let changed = false;
    const exclusions = new Map(state.manualExclusions);
    for (const key of exclusions.keys()) {
      const cell = findCellByKey(cells, key);
      if (cell && globalThis.SudokuGridDom.readCellValue(cell) !== 0) {
        exclusions.delete(key);
        changed = true;
      }
    }
    if (changed) {
      state.manualExclusions = exclusions;
    }
  }

  function gridFingerprint(grid) {
    return grid.map((row) => row.join("")).join("|");
  }

  function applyManualExclusions(cells, candidates) {
    return candidates.map((row, rowIndex) =>
      row.map((cellCandidates, columnIndex) => {
        if (!cellCandidates) {
          return null;
        }

        const exclusions = state.manualExclusions.get(
          getCellKey(cells[rowIndex][columnIndex]),
        );
        return exclusions
          ? cellCandidates.filter((candidate) => !exclusions.has(candidate))
          : cellCandidates;
      }),
    );
  }

  function rememberRenderedCandidates(cells, candidates) {
    const marks = new Map();
    const spansByCandidate = new WeakMap();
    const hitTargets = [];
    for (let row = 0; row < cells.length; row += 1) {
      for (let column = 0; column < cells[row].length; column += 1) {
        const key = getCellKey(cells[row][column]);
        const cellCandidates = candidates[row][column];
        if (key && cellCandidates) {
          marks.set(key, new Set(cellCandidates));
          const spans = globalThis.SudokuGridDom.getOwnedCandidateSpans(
            cells[row][column],
          );
          spans?.forEach((span, index) => {
            const candidate = index + 1;
            if (cellCandidates.includes(candidate)) {
              const target = { key, candidate, span };
              spansByCandidate.set(span, target);
              hitTargets.push(target);
            }
          });
        }
      }
    }
    state.renderedCandidateMarks = marks;
    state.renderedCandidateSpans = spansByCandidate;
    state.candidateHitTargets = hitTargets;
  }

  function writeExclusion(key, candidate, excluded) {
    const exclusions = new Map(state.manualExclusions);
    const updatedExclusions = new Set(exclusions.get(key));
    const wasExcluded = updatedExclusions.has(candidate);
    if (wasExcluded === excluded) {
      return false;
    }

    if (excluded) {
      updatedExclusions.add(candidate);
    } else {
      updatedExclusions.delete(candidate);
    }

    if (updatedExclusions.size === 0) {
      exclusions.delete(key);
    } else {
      exclusions.set(key, updatedExclusions);
    }

    state.manualExclusions = exclusions;
    state.exclusionUndoStack = [
      ...state.exclusionUndoStack,
      { key, candidate, wasExcluded },
    ];
    state.lastAction = "exclude";
    return true;
  }

  function excludeManualCandidate(key, candidate) {
    const visibleCandidates = state.renderedCandidateMarks.get(key);
    if (!visibleCandidates?.has(candidate)) {
      return false;
    }
    return writeExclusion(key, candidate, true);
  }

  function toggleManualCandidate(key, candidate, availableCandidates) {
    const wasExcluded = state.manualExclusions.get(key)?.has(candidate) === true;
    if (wasExcluded) {
      return writeExclusion(key, candidate, false);
    }
    if (!availableCandidates?.includes(candidate)) {
      return false;
    }
    return writeExclusion(key, candidate, true);
  }

  function undoLastExclusion() {
    if (state.lastAction !== "exclude" || state.exclusionUndoStack.length === 0) {
      return false;
    }

    const last = state.exclusionUndoStack[state.exclusionUndoStack.length - 1];
    const exclusions = new Map(state.manualExclusions);
    const updatedExclusions = new Set(exclusions.get(last.key));
    if (last.wasExcluded) {
      updatedExclusions.add(last.candidate);
    } else {
      updatedExclusions.delete(last.candidate);
    }
    if (updatedExclusions.size === 0) {
      exclusions.delete(last.key);
    } else {
      exclusions.set(last.key, updatedExclusions);
    }
    state.manualExclusions = exclusions;
    state.exclusionUndoStack = state.exclusionUndoStack.slice(0, -1);
    state.lastAction = state.exclusionUndoStack.length > 0 ? "exclude" : null;
    return true;
  }

  function pointHitsSpan(span, clientX, clientY) {
    if (
      typeof clientX !== "number" ||
      typeof clientY !== "number" ||
      typeof span.getBoundingClientRect !== "function"
    ) {
      return false;
    }

    const rect = span.getBoundingClientRect();
    return (
      clientX >= rect.left &&
      clientX < rect.right &&
      clientY >= rect.top &&
      clientY < rect.bottom
    );
  }

  function findCandidateFromEvent(event) {
    const direct = state.renderedCandidateSpans.get(event.target);
    if (direct) {
      return direct;
    }

    const host = event.target?.closest?.("[data-scf-candidate]");
    if (host) {
      const mapped = state.renderedCandidateSpans.get(host);
      if (mapped) {
        return mapped;
      }
      const candidate = Number(host.dataset?.scfCandidate);
      if (candidate >= 1 && candidate <= 9) {
        const key = getCellKey(host.closest?.("td") ?? host.parentElement?.parentElement);
        if (key) {
          return { key, candidate, span: host };
        }
      }
    }

    return state.candidateHitTargets.find((target) =>
      pointHitsSpan(target.span, event.clientX, event.clientY),
    ) ?? null;
  }

  function readEnteredDigit(event) {
    if (
      typeof event.key === "string" &&
      /^[1-9]$/.test(event.key) &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey
    ) {
      return Number(event.key);
    }

    const control = event.target?.closest?.("button, [role='button']");
    return globalThis.SudokuAgeUi.readDigitFromControl(control);
  }

  function resolveArmedDigit() {
    return globalThis.SudokuAgeUi.findArmedDigit(document, state.armedDigit);
  }

  function toggleCandidateForCell(cell, digit) {
    const key = getCellKey(cell);
    if (!key || globalThis.SudokuGridDom.readCellValue(cell) !== 0) {
      return false;
    }

    const cells = globalThis.SudokuGridDom.getPuzzleCells(state.puzzleTable);
    if (!cells) {
      return false;
    }

    let grid;
    try {
      grid = globalThis.SudokuGridDom.readGrid(cells);
    } catch (_error) {
      return false;
    }

    const standardCandidates = globalThis.SudokuCandidates.calculateCandidates(grid);
    let available = null;
    for (let row = 0; row < cells.length; row += 1) {
      for (let column = 0; column < cells[row].length; column += 1) {
        if (getCellKey(cells[row][column]) === key) {
          available = standardCandidates[row][column];
        }
      }
    }

    if (!toggleManualCandidate(key, digit, available)) {
      return false;
    }
    refreshCandidates();
    return true;
  }

  function isUndoButton(event) {
    const control = event.target?.closest?.("button, [role='button']");
    if (!control) {
      return false;
    }
    const label = `${control.textContent ?? ""} ${
      control.getAttribute?.("aria-label") ?? ""
    } ${control.getAttribute?.("title") ?? ""}`;
    return /\bundo\b/i.test(label);
  }

  function isUndoKey(event) {
    return (
      (event.key === "z" || event.key === "Z") &&
      (event.metaKey || event.ctrlKey) &&
      !event.altKey &&
      !event.shiftKey
    );
  }

  function stopEvent(event) {
    event.preventDefault?.();
    event.stopImmediatePropagation?.();
    event.stopPropagation?.();
  }

  function observeForPuzzle() {
    discoveryObserver?.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  function watchPuzzleTable(table) {
    if (table === state.puzzleTable) {
      return;
    }

    tableObserver?.disconnect();
    if (state.puzzleTable) {
      resetCandidateState();
    }
    state.puzzleTable = table;

    if (!table) {
      observeForPuzzle();
      return;
    }

    tableObserver = new MutationObserver((mutations) => {
      const changedOnlyByExtension =
        state.renderedSpans &&
        mutations.every((mutation) => state.renderedSpans.has(mutation.target));
      if (!changedOnlyByExtension) {
        scheduleRefresh();
      }
    });
    tableObserver.observe(table, { childList: true, subtree: true });
  }

  function refreshCandidates() {
    state.scheduled = false;
    if (!state.enabled) {
      state.lastStatus = "Automatic candidates are disabled.";
      return { ok: true, status: state.lastStatus };
    }

    updatePuzzleLocation();
    const table = globalThis.SudokuGridDom.findPuzzleTable(document);
    watchPuzzleTable(table);
    const cells = table && globalThis.SudokuGridDom.getPuzzleCells(table);
    if (!cells) {
      state.lastStatus = "No supported Sudoku grid found on this page.";
      return { ok: false, status: state.lastStatus };
    }

    try {
      const grid = globalThis.SudokuGridDom.readGrid(cells);
      const fingerprint = gridFingerprint(grid);
      if (state.gridFingerprint !== null && fingerprint !== state.gridFingerprint) {
        // A real digit change means the page owns Undo.
        state.lastAction = "grid";
        state.exclusionUndoStack = [];
      }
      state.gridFingerprint = fingerprint;
      pruneExclusionsForFilledCells(cells);

      const candidates = applyManualExclusions(
        cells,
        globalThis.SudokuCandidates.calculateCandidates(grid),
      );
      const updatedSpans = globalThis.SudokuGridDom.renderCandidates(
        cells,
        candidates,
      );
      rememberRenderedCandidates(cells, candidates);
      state.renderedSpans = new WeakSet(updatedSpans);
      window.queueMicrotask(() => {
        state.renderedSpans = null;
      });
      state.lastStatus = "Candidates are up to date.";
      return { ok: true, status: state.lastStatus };
    } catch (error) {
      console.warn("Sudoku Candidate Filler could not read this grid.", error);
      state.lastStatus = "The puzzle has conflicting values; candidates were not changed.";
      return { ok: false, status: state.lastStatus };
    }
  }

  function scheduleRefresh() {
    if (!state.enabled || state.scheduled) {
      return;
    }

    state.scheduled = true;
    window.setTimeout(refreshCandidates, 50);
  }

  function scheduleRefreshAfterContinue() {
    for (const delay of CONTINUE_REFRESH_DELAYS) {
      window.setTimeout(refreshCandidates, delay);
    }
  }

  function updatePuzzleLocation() {
    const location = globalThis.location?.href ?? null;
    if (state.puzzleLocation === location) {
      return false;
    }

    resetCandidateState();
    state.puzzleLocation = location;
    return true;
  }

  function handleSameDocumentNavigation() {
    if (updatePuzzleLocation()) {
      scheduleRefresh();
    }
  }

  function handlePencilDigitInput(event) {
    const digit = readEnteredDigit(event);
    if (!state.enabled || !isPencilModeActive() || !digit || !state.puzzleTable) {
      return false;
    }

    state.armedDigit = digit;

    const cells = globalThis.SudokuGridDom.getPuzzleCells(state.puzzleTable);
    if (!cells) {
      return false;
    }

    // Keypad clicks follow Age digit-first UX: arm and wait for cell clicks.
    // Keyboard digits still toggle the live/remembered selected cell.
    const fromKeyboard = typeof event.key === "string";
    const selected = resolveSelectedCell(cells, {
      allowRemembered: fromKeyboard,
    });
    if (!selected) {
      return true;
    }
    if (!toggleCandidateForCell(selected, digit)) {
      return false;
    }
    stopEvent(event);
    return true;
  }

  function handlePencilCellClick(event) {
    if (!state.enabled || !isPencilModeActive() || !state.puzzleTable) {
      return false;
    }

    const button = event.target?.closest?.("button[data-x][data-y]");
    if (!button) {
      return false;
    }

    const digit = resolveArmedDigit();
    if (!digit) {
      return false;
    }

    const cells = globalThis.SudokuGridDom.getPuzzleCells(state.puzzleTable);
    if (!cells) {
      return false;
    }

    for (const row of cells) {
      for (const cell of row) {
        if (cell.querySelector("button[data-x][data-y]") === button) {
          if (!toggleCandidateForCell(cell, digit)) {
            return false;
          }
          stopEvent(event);
          return true;
        }
      }
    }
    return false;
  }

  function handleCandidateElimination(event) {
    if (!event.altKey) {
      return false;
    }

    const renderedCandidate = findCandidateFromEvent(event);
    if (
      renderedCandidate &&
      excludeManualCandidate(renderedCandidate.key, renderedCandidate.candidate)
    ) {
      stopEvent(event);
      refreshCandidates();
      return true;
    }
    return false;
  }

  function handleExtensionUndo(event) {
    if (!undoLastExclusion()) {
      return false;
    }
    stopEvent(event);
    refreshCandidates();
    return true;
  }

  function handlePageClick(event) {
    rememberSelectedCellFromEvent(event);
    if (handlePencilModeButtonClick(event)) {
      scheduleRefresh();
      return;
    }
    if (handleCandidateElimination(event)) {
      return;
    }
    if (isUndoButton(event) && handleExtensionUndo(event)) {
      return;
    }

    // Prefer digit-first: armed digit + puzzle cell click.
    if (handlePencilCellClick(event)) {
      return;
    }
    if (handlePencilDigitInput(event)) {
      return;
    }
    scheduleRefresh();

    const button = event.target.closest?.("button");
    if (button?.textContent.trim().toLowerCase() === "continue") {
      scheduleRefreshAfterContinue();
    }
  }

  function handlePageKeydown(event) {
    if (isUndoKey(event) && handleExtensionUndo(event)) {
      return;
    }
    handlePencilDigitInput(event);
  }

  function handleMessage(message, _sender, sendResponse) {
    if (message?.type === "get-status") {
      sendResponse({ enabled: state.enabled, status: state.lastStatus });
      return;
    }

    if (message?.type === "fill") {
      sendResponse(refreshCandidates());
      return;
    }

    if (message?.type === "set-enabled") {
      const previousEnabled = state.enabled;
      state.enabled = Boolean(message.enabled);
      chrome.storage.local
        .set({ [ENABLED_KEY]: state.enabled })
        .then(() => {
          const result = state.enabled
            ? refreshCandidates()
            : { ok: true, status: "Automatic candidates are disabled." };
          state.lastStatus = result.status;
          sendResponse({ enabled: state.enabled, ...result });
        })
        .catch(() => {
          state.enabled = previousEnabled;
          state.lastStatus = "Could not save the extension setting.";
          sendResponse({ enabled: state.enabled, ok: false, status: state.lastStatus });
        });
      return true;
    }
  }

  chrome.runtime.onMessage.addListener(handleMessage);

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[ENABLED_KEY]) {
      return;
    }

    state.enabled = changes[ENABLED_KEY].newValue !== false;
    scheduleRefresh();
  });

  discoveryObserver = new MutationObserver(() => {
    if (!state.puzzleTable?.isConnected) {
      scheduleRefresh();
    }
  });
  observeForPuzzle();
  document.addEventListener("focusin", rememberSelectedCellFromEvent, true);
  document.addEventListener("click", handlePageClick, true);
  document.addEventListener("keydown", handlePageKeydown, true);
  document.addEventListener("keyup", scheduleRefresh, true);
  window.addEventListener("focus", scheduleRefresh);
  window.addEventListener("popstate", handleSameDocumentNavigation);
  window.addEventListener("hashchange", handleSameDocumentNavigation);
  window.setInterval(handleSameDocumentNavigation, ROUTE_CHECK_INTERVAL_MS);

  chrome.storage.local
    .get({ [ENABLED_KEY]: true })
    .then((settings) => {
      state.enabled = settings[ENABLED_KEY];
      scheduleRefresh();
    })
    .catch(() => {
      state.lastStatus = "Could not load the extension setting; automatic updates are on.";
      scheduleRefresh();
    });
})();

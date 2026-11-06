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
    state.lastAction = null;
    state.gridFingerprint = null;
  }

  function getCellKey(cell) {
    const button = cell.querySelector("button[data-x][data-y]");
    const { x, y } = button?.dataset ?? {};
    return /^[0-8]$/.test(x) && /^[0-8]$/.test(y) ? `${x},${y}` : null;
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

  function excludeManualCandidate(key, candidate) {
    const visibleCandidates = state.renderedCandidateMarks.get(key);
    const existingExclusions = state.manualExclusions.get(key);
    if (!visibleCandidates?.has(candidate) || existingExclusions?.has(candidate)) {
      return false;
    }

    const exclusions = new Map(state.manualExclusions);
    const updatedExclusions = new Set(existingExclusions);
    updatedExclusions.add(candidate);
    exclusions.set(key, updatedExclusions);
    state.manualExclusions = exclusions;
    state.exclusionUndoStack = [...state.exclusionUndoStack, { key, candidate }];
    state.lastAction = "exclude";
    return true;
  }

  function undoLastExclusion() {
    if (state.lastAction !== "exclude" || state.exclusionUndoStack.length === 0) {
      return false;
    }

    const last = state.exclusionUndoStack[state.exclusionUndoStack.length - 1];
    const exclusions = new Map(state.manualExclusions);
    const updatedExclusions = new Set(exclusions.get(last.key));
    updatedExclusions.delete(last.candidate);
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
      const fingerprint = grid.map((row) => row.join("")).join("|");
      if (state.gridFingerprint !== null && fingerprint !== state.gridFingerprint) {
        // A real digit change means the page owns Undo; drop stale exclusions.
        state.lastAction = "grid";
        state.exclusionUndoStack = [];
      }
      state.gridFingerprint = fingerprint;

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
    if (handleCandidateElimination(event)) {
      return;
    }
    if (isUndoButton(event) && handleExtensionUndo(event)) {
      return;
    }

    scheduleRefresh();

    const button = event.target.closest?.("button");
    if (button?.textContent.trim().toLowerCase() === "continue") {
      scheduleRefreshAfterContinue();
    }
  }

  function handlePageKeydown(event) {
    if (isUndoKey(event)) {
      handleExtensionUndo(event);
    }
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

(function exposeGridDom(root) {
  const GRID_SIZE = 9;
  const EMPTY_MARK = "\u00a0";

  function getCandidateContainer(cell) {
    return Array.from(cell.querySelectorAll("div")).find(
      (element) => {
        const children = Array.from(element.children);
        return (
          children.length === GRID_SIZE &&
          children.every((child) => child.tagName === "SPAN")
        );
      },
    );
  }

  function getOwnedCandidateContainer(cell) {
    return Array.from(cell.querySelectorAll("div")).find(
      (element) =>
        element.dataset.scfCandidates === "true" &&
        Array.from(element.children).length === GRID_SIZE &&
        Array.from(element.children).every((child) => child.tagName === "SPAN"),
    );
  }

  function getCandidateSpans(cell) {
    const candidateContainer = getCandidateContainer(cell);
    return candidateContainer ? Array.from(candidateContainer.children) : null;
  }

  function getOwnedCandidateSpans(cell) {
    const candidateContainer = getOwnedCandidateContainer(cell);
    return candidateContainer ? Array.from(candidateContainer.children) : null;
  }

  function getPuzzleCells(table) {
    const rows = Array.from(table.rows).filter(
      (row) => row.cells.length === GRID_SIZE,
    );
    return rows.length === GRID_SIZE
      ? rows.map((row) => Array.from(row.cells))
      : null;
  }

  function findPuzzleTable(documentRoot) {
    return Array.from(documentRoot.querySelectorAll("table")).find((table) => {
      const cells = getPuzzleCells(table);
      return (
        cells &&
        hasConsistentCellCoordinates(cells) &&
        cells.some((row) =>
          row.some(
            (cell) =>
              cell.querySelector("button[data-x][data-y]") ||
              getCandidateSpans(cell),
          ),
        )
      );
    });
  }

  function hasConsistentCellCoordinates(cells) {
    const coordinates = new Set();
    for (let row = 0; row < GRID_SIZE; row += 1) {
      for (let column = 0; column < GRID_SIZE; column += 1) {
        const button = cells[row][column].querySelector("button[data-x][data-y]");
        if (!button) {
          return false;
        }

        const xText = button.dataset.x;
        const yText = button.dataset.y;
        if (!/^[0-8]$/.test(xText) || !/^[0-8]$/.test(yText)) {
          return false;
        }

        const x = Number(xText);
        const y = Number(yText);
        const coordinate = `${x},${y}`;
        if (
          coordinates.has(coordinate)
        ) {
          return false;
        }
        coordinates.add(coordinate);
      }
    }
    return coordinates.size === GRID_SIZE * GRID_SIZE;
  }

  function readCellValue(cell) {
    const button = cell.querySelector("button[data-x][data-y]");
    if (!button) {
      return 0;
    }

    const candidateContainer = getCandidateContainer(cell);
    const valueText = textOutsideCandidateContainer(button, candidateContainer).trim();
    return /^[1-9]$/.test(valueText) ? Number(valueText) : 0;
  }

  function textOutsideCandidateContainer(node, candidateContainer) {
    if (node === candidateContainer) {
      return "";
    }
    if (node.nodeType === 3) {
      return node.textContent;
    }
    if (!node.childNodes) {
      return node.textContent ?? "";
    }

    return Array.from(node.childNodes)
      .map((child) => textOutsideCandidateContainer(child, candidateContainer))
      .join("");
  }

  function readGrid(cells) {
    return cells.map((row) => row.map(readCellValue));
  }

  function findCandidateTemplate(cells) {
    for (const row of cells) {
      for (const cell of row) {
        const template = getCandidateContainer(cell);
        if (template) {
          return template;
        }
      }
    }
    return null;
  }

  function createCandidateSpans(cell, template) {
    const button = cell.querySelector("button[data-x][data-y]");
    const documentRoot = cell.ownerDocument ?? button?.ownerDocument;
    if (!button || !documentRoot) {
      return null;
    }

    const candidateContainer = template?.cloneNode(false) ??
      documentRoot.createElement("div");
    if (!template) {
      candidateContainer.className = "erBN0";
    }
    candidateContainer.dataset.scfCandidates = "true";

    const spans = Array.from({ length: GRID_SIZE }, () => {
      const span = documentRoot.createElement("span");
      span.textContent = EMPTY_MARK;
      candidateContainer.append(span);
      return span;
    });
    cell.append(candidateContainer);
    return spans;
  }

  function setOwnedCandidateMetadata(spans, candidates) {
    for (let index = 0; index < spans.length; index += 1) {
      const span = spans[index];
      const candidate = index + 1;
      const isActive = candidates.includes(candidate);
      if (span.dataset) {
        if (isActive) {
          span.dataset.scfCandidate = String(candidate);
        } else {
          delete span.dataset.scfCandidate;
        }
      }
      // Keep marks paint-only so the native cell button receives normal clicks.
      if (span.style) {
        span.style.cursor = "";
        span.style.pointerEvents = "none";
        span.style.position = "";
        span.style.zIndex = "";
      }
      span.tabIndex = -1;
      span.removeAttribute?.("role");
      span.removeAttribute?.("aria-label");
    }
  }

  function removeOwnedCandidateContainers(cell) {
    for (const container of Array.from(cell.querySelectorAll("div"))) {
      if (container.dataset.scfCandidates === "true") {
        container.remove();
      }
    }
  }

  function renderCandidates(cells, candidates) {
    const updatedSpans = [];
    const template = findCandidateTemplate(cells);
    for (let row = 0; row < GRID_SIZE; row += 1) {
      for (let column = 0; column < GRID_SIZE; column += 1) {
        const cellCandidates = candidates[row][column];
        if (!cellCandidates) {
          removeOwnedCandidateContainers(cells[row][column]);
          continue;
        }

        const spans = getOwnedCandidateSpans(cells[row][column]) ??
          createCandidateSpans(cells[row][column], template);
        if (!spans) {
          continue;
        }
        const container = getOwnedCandidateContainer(cells[row][column]);
        if (!container) {
          continue;
        }
        if (container.style) {
          container.style.pointerEvents = "none";
        }
        for (let index = 0; index < spans.length; index += 1) {
          const nextMark = cellCandidates.includes(index + 1)
            ? String(index + 1)
            : EMPTY_MARK;
          if (spans[index].textContent !== nextMark) {
            spans[index].textContent = nextMark;
            updatedSpans.push(spans[index]);
          }
        }
        setOwnedCandidateMetadata(spans, cellCandidates);
      }
    }
    return updatedSpans;
  }

  const api = Object.freeze({
    findPuzzleTable,
    getCandidateSpans,
    getOwnedCandidateSpans,
    getPuzzleCells,
    hasConsistentCellCoordinates,
    readCellValue,
    readGrid,
    renderCandidates,
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.SudokuGridDom = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

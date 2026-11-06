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

  function getCandidateSpans(cell) {
    const candidateContainer = getCandidateContainer(cell);
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

    const valueText = button.childNodes
      ? Array.from(button.childNodes)
        .filter((node) => node.nodeType === 3)
        .map((node) => node.textContent)
        .join("")
      : button.textContent;
    const value = Number.parseInt(valueText.trim(), 10);
    return value >= 1 && value <= GRID_SIZE ? value : 0;
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

        const spans = getCandidateSpans(cells[row][column]) ??
          createCandidateSpans(cells[row][column], template);
        if (!spans) {
          continue;
        }
        const container = getCandidateContainer(cells[row][column]);
        if (container.dataset.scfCandidates !== "true") {
          continue;
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
      }
    }
    return updatedSpans;
  }

  const api = Object.freeze({
    findPuzzleTable,
    getCandidateSpans,
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

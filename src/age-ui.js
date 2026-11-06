(function exposeAgeUi(root) {
  const PENCIL_LABEL = /\bpencil(?:\s+mode)?\b/i;

  function controlLabel(element) {
    if (!element) {
      return "";
    }
    return `${element.getAttribute?.("aria-label") ?? ""} ${
      element.textContent ?? ""
    } ${element.getAttribute?.("title") ?? ""}`
      .replace(/\s+/g, " ")
      .trim();
  }

  function classTokens(element) {
    if (!element) {
      return [];
    }
    if (element.classList && typeof element.classList[Symbol.iterator] === "function") {
      return Array.from(element.classList);
    }
    return String(element.className ?? "")
      .split(/\s+/)
      .filter(Boolean);
  }

  function readDigitFromControl(element) {
    if (!element || element.dataset?.x != null || element.dataset?.y != null) {
      return null;
    }
    const dataN = element.dataset?.n;
    if (/^[1-9]$/.test(dataN)) {
      return Number(dataN);
    }
    const values = [
      (element.textContent ?? "").trim(),
      element.getAttribute?.("aria-label")?.trim(),
      element.getAttribute?.("title")?.trim(),
    ];
    for (const value of values) {
      if (value && /^[1-9]$/.test(value)) {
        return Number(value);
      }
    }
    // The Age keypad sometimes repeats the digit in accessible text ("2 2").
    for (const value of values) {
      if (!value) {
        continue;
      }
      const digits = value.match(/[1-9]/g);
      if (digits && digits.length > 0 && new Set(digits).size === 1) {
        return Number(digits[0]);
      }
    }
    return null;
  }

  function isPencilModeControl(element) {
    return Boolean(element) && PENCIL_LABEL.test(controlLabel(element));
  }

  function readPressedAttribute(element) {
    const pressed = element?.getAttribute?.("aria-pressed");
    if (pressed === "true") {
      return true;
    }
    if (pressed === "false") {
      return false;
    }
    const checked = element?.getAttribute?.("aria-checked");
    if (checked === "true") {
      return true;
    }
    if (checked === "false") {
      return false;
    }
    const current = element?.getAttribute?.("aria-current");
    if (current === "true") {
      return true;
    }
    if (current === "false") {
      return false;
    }
    const selected = element?.getAttribute?.("aria-selected");
    if (selected === "true") {
      return true;
    }
    if (selected === "false") {
      return false;
    }
    return null;
  }

  function looksSelected(element) {
    if (!element) {
      return false;
    }
    if (readPressedAttribute(element) === true) {
      return true;
    }
    if (
      element.dataset?.selected === "true" ||
      element.dataset?.active === "true" ||
      element.dataset?.state === "on"
    ) {
      return true;
    }
    return /\b(active|selected|pressed|is-active|is-on|is-selected)\b/i.test(
      element.className ?? "",
    );
  }

  function findKeypadDigitControls(documentRoot) {
    const withDataN = Array.from(
      documentRoot.querySelectorAll?.("button[data-n]") ?? [],
    ).filter((element) => /^[1-9]$/.test(element.dataset?.n));
    if (withDataN.length > 0) {
      return withDataN;
    }
    return Array.from(
      documentRoot.querySelectorAll?.("button, [role='button']") ?? [],
    ).filter((element) => readDigitFromControl(element) != null);
  }

  function findKeypadSelectionClass(digitControls) {
    const counts = new Map();
    for (const control of digitControls) {
      for (const token of classTokens(control)) {
        counts.set(token, (counts.get(token) ?? 0) + 1);
      }
    }

    let selectionClass = null;
    let selectionCount = Number.POSITIVE_INFINITY;
    for (const [token, count] of counts) {
      if (count >= 1 && count < digitControls.length && count < selectionCount) {
        selectionClass = token;
        selectionCount = count;
      }
    }
    return selectionClass;
  }

  function hasClassToken(element, token) {
    return Boolean(token) && classTokens(element).includes(token);
  }

  function findPencilModeControl(documentRoot) {
    return (
      Array.from(
        documentRoot.querySelectorAll?.("button, [role='button']") ?? [],
      ).find(isPencilModeControl) ?? null
    );
  }

  function findArmedDigit(documentRoot, trackedArmedDigit = null) {
    const digitControls = findKeypadDigitControls(documentRoot);
    const selectionClass = findKeypadSelectionClass(digitControls);

    for (const control of digitControls) {
      const digit = readDigitFromControl(control);
      if (!digit) {
        continue;
      }
      const pressed = readPressedAttribute(control);
      if (pressed === true) {
        return digit;
      }
      if (pressed == null && selectionClass && hasClassToken(control, selectionClass)) {
        return digit;
      }
      if (pressed == null && !selectionClass && looksSelected(control)) {
        return digit;
      }
    }

    return trackedArmedDigit >= 1 && trackedArmedDigit <= 9
      ? trackedArmedDigit
      : null;
  }

  function isAgePencilModeActive(documentRoot, trackedPencilMode = false) {
    const control = findPencilModeControl(documentRoot);
    if (!control) {
      return trackedPencilMode === true;
    }

    const pressed = readPressedAttribute(control);
    if (pressed != null) {
      return pressed;
    }

    // The Age uses a CSS-module class (e.g. I3KTk) shared by the armed digit
    // and the Pencil button when that control is selected—no aria-pressed.
    const digitControls = findKeypadDigitControls(documentRoot);
    const selectionClass = findKeypadSelectionClass(digitControls);
    if (selectionClass) {
      return hasClassToken(control, selectionClass);
    }

    const deleteControl = documentRoot.querySelector?.('button[data-n="0"]');
    if (deleteControl) {
      const deleteClasses = new Set(classTokens(deleteControl));
      if (classTokens(control).some((token) => !deleteClasses.has(token))) {
        return true;
      }
      if (classTokens(control).length === 0) {
        return false;
      }
    }

    return trackedPencilMode === true;
  }

  const api = Object.freeze({
    controlLabel,
    findArmedDigit,
    findKeypadDigitControls,
    findKeypadSelectionClass,
    findPencilModeControl,
    isAgePencilModeActive,
    isPencilModeControl,
    looksSelected,
    readDigitFromControl,
    readPressedAttribute,
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.SudokuAgeUi = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

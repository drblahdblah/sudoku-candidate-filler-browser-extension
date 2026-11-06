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
    return null;
  }

  function findPencilModeControl(documentRoot) {
    return (
      Array.from(
        documentRoot.querySelectorAll?.("button, [role='button']") ?? [],
      ).find(isPencilModeControl) ?? null
    );
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

    // Without aria-pressed, trust click-tracked state for The Age toggle.
    return trackedPencilMode === true;
  }

  const api = Object.freeze({
    controlLabel,
    findPencilModeControl,
    isAgePencilModeActive,
    isPencilModeControl,
    readPressedAttribute,
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.SudokuAgeUi = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

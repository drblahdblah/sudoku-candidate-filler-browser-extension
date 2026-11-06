const assert = require("node:assert/strict");
const test = require("node:test");

const {
  findArmedDigit,
  findPencilModeControl,
  isAgePencilModeActive,
  isPencilModeControl,
  readDigitFromControl,
} = require("../src/age-ui.js");

function createButton({
  ariaLabel = "",
  textContent = "",
  title = "",
  ariaPressed = null,
  className = "",
  dataset = {},
} = {}) {
  const attributes = new Map();
  if (ariaLabel) {
    attributes.set("aria-label", ariaLabel);
  }
  if (title) {
    attributes.set("title", title);
  }
  if (ariaPressed != null) {
    attributes.set("aria-pressed", ariaPressed);
  }
  const classList = className.split(/\s+/).filter(Boolean);
  return {
    textContent,
    className,
    classList,
    dataset,
    getAttribute(name) {
      return attributes.get(name) ?? null;
    },
  };
}

function createDocument(buttons) {
  return {
    querySelectorAll(selector) {
      if (selector === "button[data-n]") {
        return buttons.filter((button) => button.dataset?.n != null);
      }
      if (selector === "button, [role='button']") {
        return buttons;
      }
      return [];
    },
    querySelector(selector) {
      if (selector === 'button[data-n="0"]') {
        return buttons.find((button) => button.dataset?.n === "0") ?? null;
      }
      return null;
    },
  };
}

test("detects The Age Pencil mode control by accessible name", () => {
  const pencil = createButton({ ariaLabel: "Pencil mode" });
  const undo = createButton({ textContent: "Undo" });
  const documentRoot = createDocument([undo, pencil]);

  assert.equal(isPencilModeControl(pencil), true);
  assert.equal(isPencilModeControl(undo), false);
  assert.equal(findPencilModeControl(documentRoot), pencil);
});

test("reads pressed state from aria-pressed for Pencil mode", () => {
  const off = createButton({ ariaLabel: "Pencil mode", ariaPressed: "false" });
  const on = createButton({ ariaLabel: "Pencil mode", ariaPressed: "true" });

  assert.equal(isAgePencilModeActive(createDocument([off])), false);
  assert.equal(isAgePencilModeActive(createDocument([on])), true);
});

test("falls back to tracked pencil mode when pressed state is absent", () => {
  const pencil = createButton({ ariaLabel: "Pencil mode", className: "active" });
  const documentRoot = createDocument([pencil]);

  assert.equal(isAgePencilModeActive(documentRoot, false), false);
  assert.equal(isAgePencilModeActive(documentRoot, true), true);
});

test("does not treat generic active classes as pencil mode on", () => {
  const pencil = createButton({
    ariaLabel: "Pencil mode",
    className: "active selected pressed",
  });
  assert.equal(isAgePencilModeActive(createDocument([pencil]), false), false);
});

test("detects Age pencil mode from the keypad selection CSS class", () => {
  const selectedClass = "I3KTk";
  const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) =>
    createButton({
      textContent: String(digit),
      dataset: { n: String(digit) },
      className: digit === 2 ? selectedClass : "",
    }),
  );
  const deleteKey = createButton({ textContent: "Delete", dataset: { n: "0" } });
  const pencilOn = createButton({
    textContent: "Pencil mode",
    className: selectedClass,
  });
  const pencilOff = createButton({ textContent: "Pencil mode" });

  assert.equal(
    isAgePencilModeActive(createDocument([...digits, deleteKey, pencilOn]), false),
    true,
  );
  assert.equal(
    isAgePencilModeActive(createDocument([...digits, deleteKey, pencilOff]), true),
    false,
  );
});

test("finds an armed keypad digit from aria-pressed or tracked state", () => {
  const two = createButton({ textContent: "2", ariaPressed: "true" });
  const three = createButton({ textContent: "3" });
  assert.equal(findArmedDigit(createDocument([three, two])), 2);
  assert.equal(findArmedDigit(createDocument([three]), 8), 8);
  assert.equal(findArmedDigit(createDocument([three])), null);
});

test("finds an armed Age keypad digit from data-n and selection class", () => {
  const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) =>
    createButton({
      textContent: String(digit),
      dataset: { n: String(digit) },
      className: digit === 8 ? "I3KTk" : "",
    }),
  );
  assert.equal(findArmedDigit(createDocument(digits)), 8);
  assert.equal(readDigitFromControl(digits[1]), 2);
});

test("reads keypad digits from repeated Age accessible labels", () => {
  assert.equal(readDigitFromControl(createButton({ textContent: "2 2" })), 2);
  assert.equal(
    readDigitFromControl(createButton({ ariaLabel: "8 8" })),
    8,
  );
  assert.equal(
    readDigitFromControl(createButton({ textContent: "2", dataset: { x: "1" } })),
    null,
  );
});

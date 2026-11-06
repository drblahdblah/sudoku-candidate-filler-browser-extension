const assert = require("node:assert/strict");
const test = require("node:test");

const {
  findPencilModeControl,
  isAgePencilModeActive,
  isPencilModeControl,
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
  return {
    textContent,
    className,
    dataset,
    getAttribute(name) {
      return attributes.get(name) ?? null;
    },
  };
}

function createDocument(buttons) {
  return {
    querySelectorAll(selector) {
      return selector === "button, [role='button']" ? buttons : [];
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

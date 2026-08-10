import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { webcrypto } from "node:crypto";

class FakeClassList {
  add() {}
  remove() {}
  toggle() {}
}

class FakeElement {
  constructor() {
    this.value = "";
    this.hidden = false;
    this.checked = false;
    this.dataset = {};
    this.classList = new FakeClassList();
    this.style = { setProperty() {} };
  }
  addEventListener() {}
  append() {}
  click() {}
  focus() {}
  querySelector() { return new FakeElement(); }
  querySelectorAll() { return []; }
  set innerHTML(value) { this._innerHTML = value; }
  get innerHTML() { return this._innerHTML || ""; }
  set textContent(value) { this._textContent = value; }
  get textContent() { return this._textContent || ""; }
}

const elementMap = new Map();
const getElement = (selector) => {
  if (!elementMap.has(selector)) elementMap.set(selector, new FakeElement());
  return elementMap.get(selector);
};

const storage = new Map();
const context = vm.createContext({
  console,
  crypto: webcrypto,
  URLSearchParams,
  Blob,
  URL,
  Date,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  requestAnimationFrame: (callback) => callback(),
  matchMedia: () => ({ matches: false }),
  location: { search: "" },
  window: { open() {} },
  localStorage: {
    getItem: (key) => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value),
  },
  document: {
    documentElement: { dataset: {} },
    querySelector: getElement,
    querySelectorAll: () => [],
    addEventListener() {},
    createElement: () => new FakeElement(),
  },
});

const source = fs.readFileSync(new URL("../sidepanel.js", import.meta.url), "utf8");
vm.runInContext(source, context);
await new Promise((resolve) => setTimeout(resolve, 0));

const run = (expression) => vm.runInContext(expression, context);

assert.equal(run(`occursOn({date:"2026-08-10", repeat:"daily"}, "2026-08-14")`), true);
assert.equal(run(`occursOn({date:"2026-08-10", repeat:"weekly"}, "2026-08-17")`), true);
assert.equal(run(`occursOn({date:"2026-08-10", repeat:"weekly"}, "2026-08-18")`), false);
assert.equal(run(`occursOn({date:"2026-01-15", repeat:"monthly"}, "2026-04-15")`), true);

run(`elements.taskTitle.value = "Bericht morgen 14:30 #Arbeit !hoch @wöchentlich"; applySmartInput(true)`);
assert.equal(run(`elements.taskTime.value`), "14:30");
assert.equal(run(`elements.taskRepeat.value`), "weekly");
assert.equal(run(`elements.taskTitle.value`), "Bericht");

run(`elements.taskDate.value = "2026-08-10"; applyQuickDate("plus-one")`);
assert.equal(run(`elements.taskDate.value`), "2026-08-11");

assert.equal(run(`normalizeTask({title:"Test", date:"2026-08-10", subtasks:[{title:"Schritt", completed:true}]}).subtasks[0].completed`), true);
assert.equal(run(`isOccurrenceComplete({repeat:"weekly", completionDates:["2026-08-10"]}, "2026-08-10")`), true);
assert.equal(run(`bestWeekday()`), "–");
assert.equal(run(`completionRate()`), 0);

console.log("Planbar logic smoke tests passed.");

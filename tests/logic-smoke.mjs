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
  setAttribute() {}
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
  navigator: { language: "de-DE" },
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

const load = (file) => vm.runInContext(fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), context);
load("core.js");
load("i18n.js");
load("sidepanel.js");
await new Promise((resolve) => setTimeout(resolve, 0));

const run = (expression) => vm.runInContext(expression, context);

assert.equal(run(`occursOn({date:"2026-08-10", repeat:"daily"}, "2026-08-14")`), true);
assert.equal(run(`occursOn({date:"2026-08-10", repeat:"weekly"}, "2026-08-17")`), true);
assert.equal(run(`occursOn({date:"2026-08-10", repeat:"weekly"}, "2026-08-18")`), false);
assert.equal(run(`occursOn({date:"2026-01-15", repeat:"monthly"}, "2026-04-15")`), true);

// Monthly tasks started on a long month still recur in shorter months, clamped to the last day.
assert.equal(run(`occursOn({date:"2026-01-31", repeat:"monthly"}, "2026-02-28")`), true);
assert.equal(run(`occursOn({date:"2026-01-31", repeat:"monthly"}, "2026-03-31")`), true);
assert.equal(run(`occursOn({date:"2026-01-31", repeat:"monthly"}, "2026-02-27")`), false);
assert.equal(run(`occursOn({date:"2024-01-30", repeat:"monthly"}, "2024-02-29")`), true);
assert.equal(run(`occursOn({date:"2026-01-15", repeat:"monthly"}, "2026-02-15")`), true);

// Untrusted ids and dates must never survive into rendered attributes.
assert.equal(run(`normalizeTask({title:"x", id:'a" onmouseover="alert(1)'}).id.includes('"')`), false);
assert.equal(run(`normalizeTask({title:"x", id:"legacy_id-1"}).id`), "legacy_id-1");
assert.equal(run(`normalizeTask({title:"x", date:"<img src=x>"}).date`), run("todayString()"));
assert.equal(run(`normalizeTask({title:"x", date:"2026-02-30"}).date`), run("todayString()"));
assert.equal(run(`normalizeTask({title:"x", time:"99:99"}).time`), "");
assert.equal(run(`normalizeTask({title:"x", reminder:"evil"}).reminder`), "none");
assert.equal(run(`normalizeTask({title:"x", notes:"n".repeat(6000)}).notes.length`), 5000);
assert.equal(run(`normalizeTask({title:"x", dependencyIds:['bad"id', "good-id"]}).dependencyIds.join()`), "good-id");
assert.equal(run(`normalizeTask({title:"x", completionDates:["2026-01-01","nope"]}).completionDates.join()`), "2026-01-01");

run(`elements.taskTitle.value = "Bericht morgen 14:30 #Arbeit !hoch @wöchentlich"; applySmartInput(true)`);
assert.equal(run(`elements.taskTime.value`), "14:30");
assert.equal(run(`elements.taskRepeat.value`), "weekly");
assert.equal(run(`elements.taskTitle.value`), "Bericht");

run(`elements.taskDate.value = "2026-08-10"; applyQuickDate("plus-one")`);
assert.equal(run(`elements.taskDate.value`), "2026-08-11");

assert.equal(run(`normalizeTask({title:"Test", date:"2026-08-10", subtasks:[{title:"Schritt", completed:true}]}).subtasks[0].completed`), true);
assert.equal(run(`isOccurrenceComplete({repeat:"weekly", completionDates:["2026-08-10"]}, "2026-08-10")`), true);
assert.equal(run(`autoArchiveConfig({}).value`), 48);
assert.equal(run(`autoArchiveConfig({}).unit`), "hours");
assert.equal(run(`autoArchiveDelayMs({autoArchiveValue:3, autoArchiveUnit:"weeks"})`), 3 * 7 * 86400000);
assert.equal(run(`autoArchiveDelayMs({autoArchiveValue:1.5, autoArchiveUnit:"days"})`), 36 * 3600000);
assert.equal(run(`autoArchiveConfig({autoArchiveDays:30}).unit`), "days", "legacy day presets migrate without changing their delay");

assert.equal(run(`normalizeTask({title:"Test", date:"2026-08-10"}).dependencyIds.length`), 0);
run(`state.tasks = [
  normalizeTask({id:"a", title:"Prepare", date:"2026-08-10", completed:false}),
  normalizeTask({id:"b", title:"Publish", date:"2026-08-10", dependencyIds:["a"]})
]`);
assert.equal(run(`unresolvedDependencies(state.tasks[1], "2026-08-10").length`), 1);
assert.equal(run(`wouldCreateCycle("a", ["b"])`), true);
run(`state.tasks[0].completed = true`);
assert.equal(run(`unresolvedDependencies(state.tasks[1], "2026-08-10").length`), 0);
run(`state.tasks[0].completedAt = Date.now() - 49 * 3600000; state.autoArchiveValue = 48; state.autoArchiveUnit = "hours"; autoArchiveTasks()`);
assert.equal(run(`Boolean(state.tasks[0].archivedAt)`), true);
assert.equal(run(`occurrencesForDate("2026-08-10").some(item => item.task.id === "a")`), false);
assert.equal(run(`translate("archive.title", {}, "en")`), "Archive");
await run(`restoreTaskById("a")`);
assert.equal(run(`state.tasks[0].archivedAt`), null);

run(`globalThis.chrome = {
  tabs: { query: async () => [
    { title:"Planbar", url:"chrome-extension://test/sidepanel.html", lastAccessed:20 },
    { title:"Example page", url:"https://example.com/page", lastAccessed:10 }
  ] },
  runtime: { getURL: (path) => "chrome-extension://test/" + path }
}`);
await run(`captureCurrentTab()`);
assert.equal(run(`state.tasks.at(-1).title`), "Example page");
assert.equal(run(`state.tasks.at(-1).sourceUrl`), "https://example.com/page");

run(`state.tasks = [
  normalizeTask({id:"open", title:"Open prerequisite", date:"2026-08-10"}),
  normalizeTask({id:"done", title:"Completed prerequisite", date:"2026-08-10", completed:true}),
  normalizeTask({id:"repeat", title:"Repeating task", date:"2026-08-10", repeat:"weekly"}),
  normalizeTask({id:"dependent", title:"Dependent task", date:"2026-08-11", dependencyIds:["open"]})
]; dependencySelection = new Set(["open"]); renderDependencyOptions(state.tasks[3])`);
assert.equal(run(`elements.dependencyList.innerHTML.includes("Open prerequisite")`), true);
assert.equal(run(`elements.dependencyList.innerHTML.includes("Completed prerequisite")`), false);
assert.equal(run(`elements.dependencyList.innerHTML.includes("Repeating task")`), false);

await run(`deleteTaskWithUndo("open")`);
assert.equal(run(`state.tasks.some(task => task.id === "open")`), false);
assert.equal(run(`state.tasks.find(task => task.id === "dependent").dependencyIds.length`), 0);
assert.ok(run(`state.deletions.open > 0`), "a delete records a tombstone");
await run(`undoLastDelete()`);
assert.equal(run(`state.tasks.some(task => task.id === "open")`), true);
assert.equal(run(`state.tasks.find(task => task.id === "dependent").dependencyIds[0]`), "open");
assert.equal(run(`"open" in state.deletions`), false, "undo clears the tombstone");

// Merging keeps the newest copy of a task and never drops one side of the merge.
assert.equal(run(`mergeTaskLists(
  [normalizeTask({id:"m", title:"local", date:"2026-08-10", updatedAt:200})],
  [normalizeTask({id:"m", title:"remote", date:"2026-08-10", updatedAt:100})]
)[0].title`), "local");
assert.equal(run(`mergeTaskLists(
  [normalizeTask({id:"m", title:"local", date:"2026-08-10", updatedAt:100})],
  [normalizeTask({id:"m", title:"remote", date:"2026-08-10", updatedAt:200})]
)[0].title`), "remote");
assert.equal(run(`mergeTaskLists(
  [normalizeTask({id:"only-local", title:"Local", date:"2026-08-10"})],
  [normalizeTask({id:"only-remote", title:"Remote", date:"2026-08-10"})]
).length`), 2);

// A tombstone removes a task only while that task has not been edited since the deletion.
assert.equal(run(`applyDeletions([normalizeTask({id:"gone", title:"Gone", date:"2026-08-10", updatedAt:100})], {gone: 150}).length`), 0);
assert.equal(run(`applyDeletions([normalizeTask({id:"back", title:"Back", date:"2026-08-10", updatedAt:200})], {back: 150}).length`), 1);

// A lagging sync payload must not wipe newer local tasks.
run(`state.tasks = [normalizeTask({id:"keep", title:"Local only", date:"2026-08-10", updatedAt: Date.now()})]; state.deletions = {}; lastWriteStamp = Date.now()`);
run(`const merged = mergeIntoState({ tasks: [], deletions: {}, updatedAt: 1 }); globalThis.mergedTasks = merged.tasks`);
assert.equal(run(`mergedTasks.length`), 1, "an empty incoming payload cannot delete local tasks");
assert.equal(run(`mergedTasks[0].id`), "keep");

// persist() folds in a write another context made meanwhile instead of overwriting it.
run(`state.tasks = [normalizeTask({id:"mine", title:"Mine", date:"2026-08-10"})]; state.deletions = {}; lastWriteStamp = 4242`);
run(`globalThis.storeBox = { planbarData: { version: 3, updatedAt: 9999, categories: state.categories, deletions: {},
  tasks: [normalizeTask({id:"theirs", title:"Theirs", date:"2026-08-10"})] } }`);
run(`chrome.storage = {
  local: { get: async () => storeBox, set: async (value) => { Object.assign(storeBox, value); } },
  sync: { get: async () => ({}), set: async () => {}, remove: async () => {} },
}`);
await run(`persist()`);
assert.equal(run(`state.tasks.map((item) => item.id).sort().join()`), "mine,theirs");
assert.equal(run(`storeBox.planbarData.tasks.length`), 2, "a concurrent write must survive the next save");

// A task the other context deleted stays deleted after our save.
run(`storeBox.planbarData = { ...storeBox.planbarData, updatedAt: 10000, tasks: [], deletions: { mine: Date.now() + 1000, theirs: Date.now() + 1000 } }`);
await run(`persist()`);
assert.equal(run(`state.tasks.length`), 0, "incoming tombstones win over untouched local tasks");

console.log("Planbar logic smoke tests passed.");

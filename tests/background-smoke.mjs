import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { webcrypto } from "node:crypto";

const listeners = {};
const calls = { alarms: [], notifications: [], menus: [], tabs: [], cleared: [], scheduleRuns: 0 };
const alarmStore = new Map();
let localData = { planbarData: { tasks: [], categories: [{ id: "work", label: "Arbeit", color: "#4f8b69" }] } };
let syncData = {};
const event = (name) => ({ addListener: (listener) => { listeners[name] = listener; } });
const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

const chrome = {
  runtime: { onInstalled: event("installed"), onStartup: event("startup"), getURL: (path) => `chrome-extension://test/${path}` },
  sidePanel: { setPanelBehavior: async () => {} },
  contextMenus: {
    onClicked: event("contextClicked"),
    removeAll: (callback) => callback(),
    create: (options) => calls.menus.push(options),
  },
  storage: {
    onChanged: event("storageChanged"),
    local: {
      get: async () => localData,
      set: async (value) => { localData = { ...localData, ...value }; },
    },
    sync: { set: async (value) => { syncData = { ...syncData, ...value }; } },
  },
  alarms: {
    onAlarm: event("alarm"),
    getAll: async () => {
      calls.scheduleRuns += 1;
      return [...alarmStore.entries()].map(([name, scheduledTime]) => ({ name, scheduledTime }));
    },
    clear: async (name) => alarmStore.delete(name),
    create: async (name, options) => {
      calls.alarms.push({ name, options });
      alarmStore.set(name, options.when ?? Date.now() + (options.delayInMinutes || 0) * 60000);
    },
  },
  notifications: {
    onClicked: event("notificationClicked"),
    create: (id, options) => calls.notifications.push({ id, options }),
    clear: (id) => calls.cleared.push(id),
  },
  tabs: { create: (options) => calls.tabs.push(options) },
};

const context = vm.createContext({ chrome, crypto: webcrypto, Date, console, setTimeout, clearTimeout, URL, encodeURIComponent });
const load = (file) => vm.runInContext(fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), context);
context.importScripts = (...files) => files.forEach(load);
load("background.js");

await listeners.installed();
assert.equal(calls.menus[0].id, "planbar-add-selection");
assert.ok(calls.menus[0].title.includes("Planbar"));
assert.ok(calls.alarms.some((alarm) => alarm.name === "planbar-maintenance"));

await listeners.contextClicked({ menuItemId: "planbar-add-selection", selectionText: "Markierter Text", pageUrl: "https://example.com" });
assert.equal(localData.planbarData.tasks[0].title, "Markierter Text");
assert.ok(localData.planbarData.tasks[0].notes.includes("https://example.com"));
assert.ok(Object.keys(syncData).some((key) => key.startsWith("planbarTask_")));
assert.equal(calls.notifications.at(-1).options.title, "Zu Planbar hinzugefügt");

// The context menu follows the language chosen in the panel.
listeners.storageChanged({ planbarData: { newValue: { language: "en" }, oldValue: { language: "de" } } }, "local");
await settle();
assert.ok(calls.menus.at(-1).title.startsWith("Add"), `expected an English context menu, got ${calls.menus.at(-1).title}`);

const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
const dateValue = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const tomorrowValue = dateValue(tomorrow);
const reminderTask = { id: "reminder-task", title: "Erinnerung testen", date: tomorrowValue, time: "23:59", repeat: "none", reminder: "15", completed: false };
localData.planbarData = { ...localData.planbarData, language: "de", tasks: [reminderTask] };
await vm.runInContext("scheduleReminders()", context);
assert.ok(calls.alarms.some((alarm) => alarm.name === `planbar:reminder-task:${tomorrowValue}`));

// Re-running with unchanged data must not tear down and rebuild the alarm.
const alarmCallsBefore = calls.alarms.length;
await vm.runInContext("scheduleReminders()", context);
assert.equal(calls.alarms.length, alarmCallsBefore, "an unchanged reminder should not be recreated");
assert.ok(alarmStore.has(`planbar:reminder-task:${tomorrowValue}`));

// Archived tasks stop notifying.
localData.planbarData = { ...localData.planbarData, tasks: [{ ...reminderTask, archivedAt: Date.now() }] };
await vm.runInContext("scheduleReminders()", context);
assert.equal(alarmStore.has(`planbar:reminder-task:${tomorrowValue}`), false, "an archived task must not keep a reminder");

// Auto-archive uses the freely configured value and unit even while the panel is closed.
const archiveTask = { id: "archive-task", title: "Später archivieren", date: dateValue(new Date()), time: "", repeat: "none", reminder: "none", completed: true, completedAt: Date.now() - 47 * 3600000, archivedAt: null };
localData.planbarData = { ...localData.planbarData, autoArchiveValue: 48, autoArchiveUnit: "hours", tasks: [archiveTask] };
await vm.runInContext("scheduleReminders()", context);
assert.ok(alarmStore.has("planbar-auto-archive"), "the next archive deadline should have its own alarm");
archiveTask.completedAt = Date.now() - 49 * 3600000;
await vm.runInContext("scheduleReminders()", context);
assert.ok(localData.planbarData.tasks[0].archivedAt, "a task past its configured delay should be archived");
assert.ok(syncData["planbarTask_archive-task"].archivedAt, "background archiving should also update Chrome Sync");

// A burst of storage writes coalesces into at most two rebuild passes.
localData.planbarData = { ...localData.planbarData, tasks: [reminderTask] };
const runsBefore = calls.scheduleRuns;
await Promise.all(Array.from({ length: 5 }, () => vm.runInContext("requestReschedule()", context)));
assert.ok(calls.scheduleRuns - runsBefore <= 2, `expected coalescing, saw ${calls.scheduleRuns - runsBefore} passes`);

// A repeating task is capped instead of filling the alarm table.
localData.planbarData = { ...localData.planbarData, tasks: [{ id: "daily-task", title: "Täglich", date: dateValue(new Date()), time: "23:59", repeat: "daily", reminder: "0", completionDates: [] }] };
await vm.runInContext("scheduleReminders()", context);
assert.ok([...alarmStore.keys()].filter((name) => name.startsWith("planbar:daily-task")).length <= 10);

// The focus round finishes in the service worker even when the panel is closed.
localData.planbarFocus = { mode: "focus", running: true, deadline: Date.now(), taskId: "daily-task", total: 1500 };
await listeners.alarm({ name: "planbar-focus" });
assert.equal(calls.notifications.at(-1).options.title, "Planbar Fokus");
assert.ok(calls.notifications.at(-1).options.message.includes("Täglich"));
assert.equal(localData.planbarFocus.running, false);

// A second alarm for an already-finished session stays silent.
const notificationsBefore = calls.notifications.length;
await listeners.alarm({ name: "planbar-focus" });
assert.equal(calls.notifications.length, notificationsBefore);

// Reminder notifications open the task and clear themselves.
listeners.notificationClicked(`planbar:reminder-task:${tomorrowValue}`);
assert.equal(calls.cleared.at(-1), `planbar:reminder-task:${tomorrowValue}`);
assert.ok(calls.tabs.at(-1).url.includes("task=reminder-task"));

console.log("Planbar background smoke tests passed.");

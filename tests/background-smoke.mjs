import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { webcrypto } from "node:crypto";

const listeners = {};
const calls = { alarms: [], notifications: [], menus: [], tabs: [] };
let localData = { planbarData: { tasks: [], categories: [{ id: "work", label: "Arbeit", color: "#4f8b69" }] } };
let syncData = {};
const event = (name) => ({ addListener: (listener) => { listeners[name] = listener; } });

const chrome = {
  runtime: { onInstalled: event("installed"), onStartup: event("startup"), onMessage: event("message"), getURL: (path) => `chrome-extension://test/${path}` },
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
    getAll: async () => [],
    clear: async () => true,
    create: async (name, options) => { calls.alarms.push({ name, options }); },
  },
  notifications: {
    onClicked: event("notificationClicked"),
    create: (id, options) => calls.notifications.push({ id, options }),
  },
  tabs: { create: (options) => calls.tabs.push(options) },
};

const context = vm.createContext({ chrome, crypto: webcrypto, Date, console, setTimeout, clearTimeout, URL, encodeURIComponent });
vm.runInContext(fs.readFileSync(new URL("../background.js", import.meta.url), "utf8"), context);

await listeners.installed();
assert.equal(calls.menus[0].id, "planbar-add-selection");
assert.ok(calls.alarms.some((alarm) => alarm.name === "planbar-maintenance"));

await listeners.contextClicked({ menuItemId: "planbar-add-selection", selectionText: "Markierter Text", pageUrl: "https://example.com" });
assert.equal(localData.planbarData.tasks[0].title, "Markierter Text");
assert.ok(Object.keys(syncData).some((key) => key.startsWith("planbarTask_")));
assert.equal(calls.notifications.at(-1).options.title, "Zu Planbar hinzugefügt");

const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
const tomorrowValue = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
localData.planbarData.tasks = [{
  id: "reminder-task",
  title: "Erinnerung testen",
  date: tomorrowValue,
  time: "23:59",
  repeat: "none",
  reminder: "15",
  completed: false,
}];
await vm.runInContext("scheduleReminders()", context);
assert.ok(calls.alarms.some((alarm) => alarm.name === `planbar:reminder-task:${tomorrowValue}`));

console.log("Planbar background smoke tests passed.");

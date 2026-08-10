const STORAGE_KEY = "planbarData";
const CONTEXT_MENU_ID = "planbar-add-selection";
const ALARM_PREFIX = "planbar:";
const MAINTENANCE_ALARM = "planbar-maintenance";

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: CONTEXT_MENU_ID,
      title: "„%s“ zu Planbar hinzufügen",
      contexts: ["selection"],
    });
  });
  chrome.alarms.create(MAINTENANCE_ALARM, { delayInMinutes: 1, periodInMinutes: 1440 });
  await scheduleReminders();
});

chrome.runtime.onStartup.addListener(async () => {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  await scheduleReminders();
  chrome.alarms.create(MAINTENANCE_ALARM, { delayInMinutes: 1, periodInMinutes: 1440 });
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "PLANBAR_RESCHEDULE_REMINDERS") scheduleReminders();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[STORAGE_KEY]) scheduleReminders();
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== CONTEXT_MENU_ID || !info.selectionText?.trim()) return;
  const data = await getLocalData();
  const task = {
    id: crypto.randomUUID(),
    title: info.selectionText.trim().slice(0, 120),
    date: localDateString(new Date()),
    time: "",
    priority: "medium",
    category: data.categories?.[0]?.id || "work",
    repeat: "none",
    reminder: "none",
    notes: info.pageUrl ? `Erfasst von: ${info.pageUrl}` : "",
    subtasks: [],
    completed: false,
    completionDates: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  data.tasks = [...(data.tasks || []), task];
  await chrome.storage.local.set({ [STORAGE_KEY]: data });
  await syncTask(task);
  chrome.notifications.create(`planbar-captured-${task.id}`, {
    type: "basic",
    iconUrl: "assets/icon-128.png",
    title: "Zu Planbar hinzugefügt",
    message: task.title,
  });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === MAINTENANCE_ALARM) {
    await scheduleReminders();
    return;
  }
  if (!alarm.name.startsWith(ALARM_PREFIX)) return;
  const [, taskId, occurrenceDate] = alarm.name.split(":");
  const data = await getLocalData();
  const task = (data.tasks || []).find((item) => item.id === taskId);
  if (!task || isComplete(task, occurrenceDate)) return;
  const category = (data.categories || []).find((item) => item.id === task.category)?.label || "Aufgabe";
  chrome.notifications.create(alarm.name, {
    type: "basic",
    iconUrl: "assets/icon-128.png",
    title: task.title,
    message: `${occurrenceDate === localDateString(new Date()) ? "Heute" : formatDate(occurrenceDate)}${task.time ? ` um ${task.time}` : ""} · ${category}`,
    priority: task.priority === "high" ? 2 : 0,
  });
});

chrome.notifications.onClicked.addListener((notificationId) => {
  if (!notificationId.startsWith(ALARM_PREFIX)) return;
  const [, taskId, occurrenceDate] = notificationId.split(":");
  chrome.tabs.create({
    url: chrome.runtime.getURL(`sidepanel.html?mode=tab&task=${encodeURIComponent(taskId)}&date=${encodeURIComponent(occurrenceDate)}`),
  });
});

async function scheduleReminders() {
  const alarms = await chrome.alarms.getAll();
  await Promise.all(alarms.filter((alarm) => alarm.name.startsWith(ALARM_PREFIX)).map((alarm) => chrome.alarms.clear(alarm.name)));
  const data = await getLocalData();
  const now = Date.now();
  const today = new Date();
  const until = new Date(today);
  until.setDate(until.getDate() + 45);

  for (const task of data.tasks || []) {
    const minutes = Number(task.reminder);
    if (!Number.isFinite(minutes) || task.reminder === "none" || !task.time) continue;
    if (!task.repeat || task.repeat === "none") {
      if (task.completed) continue;
      const date = parseDate(task.date);
      const [hours, mins] = task.time.split(":").map(Number);
      const due = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, mins).getTime();
      const fireAt = due - minutes * 60000;
      if (fireAt > now) await chrome.alarms.create(`${ALARM_PREFIX}${task.id}:${task.date}`, { when: fireAt });
      continue;
    }
    for (let cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12); cursor <= until; cursor.setDate(cursor.getDate() + 1)) {
      const value = localDateString(cursor);
      if (!occursOn(task, value) || isComplete(task, value)) continue;
      const [hours, mins] = task.time.split(":").map(Number);
      const due = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), hours, mins).getTime();
      const fireAt = due - minutes * 60000;
      if (fireAt <= now) continue;
      await chrome.alarms.create(`${ALARM_PREFIX}${task.id}:${value}`, { when: fireAt });
    }
  }
}

async function getLocalData() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || { tasks: [] };
}

async function syncTask(task) {
  try {
    await chrome.storage.sync.set({ [`planbarTask_${task.id}`]: task });
  } catch {
    // Local storage remains the source of truth if sync quota is unavailable.
  }
}

function occursOn(task, value) {
  if (value < task.date) return false;
  if (!task.repeat || task.repeat === "none") return task.date === value;
  const start = parseDate(task.date);
  const date = parseDate(value);
  const difference = Math.round((date - start) / 86400000);
  if (task.repeat === "daily") return true;
  if (task.repeat === "weekly") return difference % 7 === 0;
  if (task.repeat === "monthly") return start.getDate() === date.getDate();
  return false;
}

function isComplete(task, date) {
  return task.repeat && task.repeat !== "none" ? (task.completionDates || []).includes(date) : Boolean(task.completed);
}

function localDateString(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function formatDate(value) {
  return parseDate(value).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

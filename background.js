importScripts("core.js", "i18n.js");

const {
  STORAGE_KEY, SYNC_TASK_PREFIX, FOCUS_KEY,
  ALARM_PREFIX, FOCUS_ALARM, AUTO_ARCHIVE_ALARM, MAINTENANCE_ALARM, CONTEXT_MENU_ID,
  dateString, todayString, parseDate, addDays,
  isValidDate, safeTime, occursOn, isOccurrenceComplete, occurrenceTime, autoArchiveDelayMs,
} = globalThis.PlanbarCore;
const { t } = globalThis.PlanbarI18n;

const REMINDER_WINDOW_DAYS = 45;
const MAX_OCCURRENCES_PER_TASK = 10;
const MAX_REMINDER_ALARMS = 300;
// Chrome may clamp an alarm's fire time by up to 30 s, so only treat larger drifts as a real change.
const ALARM_DRIFT_TOLERANCE = 30000;

let schedulingRun = null;
let schedulingDirty = false;

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  const data = await getLocalData();
  await refreshContextMenu(languageOf(data));
  chrome.alarms.create(MAINTENANCE_ALARM, { delayInMinutes: 1, periodInMinutes: 1440 });
  await requestReschedule();
});

chrome.runtime.onStartup.addListener(async () => {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  const data = await getLocalData();
  await refreshContextMenu(languageOf(data));
  chrome.alarms.create(MAINTENANCE_ALARM, { delayInMinutes: 1, periodInMinutes: 1440 });
  await requestReschedule();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes[STORAGE_KEY]) return;
  const language = languageOf(changes[STORAGE_KEY].newValue);
  if (language !== languageOf(changes[STORAGE_KEY].oldValue)) refreshContextMenu(language);
  requestReschedule();
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== CONTEXT_MENU_ID || !info.selectionText?.trim()) return;
  const data = await getLocalData();
  const language = languageOf(data);
  const task = {
    id: crypto.randomUUID(),
    title: info.selectionText.trim().slice(0, 120),
    date: todayString(),
    time: "",
    priority: "medium",
    category: data.categories?.[0]?.id || "work",
    repeat: "none",
    reminder: "none",
    notes: info.pageUrl ? t("bg.capturedFrom", { url: info.pageUrl }, language) : "",
    subtasks: [],
    dependencyIds: [],
    completed: false,
    completedAt: null,
    completionDates: [],
    archivedAt: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  data.tasks = [...(data.tasks || []), task];
  data.updatedAt = Date.now();
  await chrome.storage.local.set({ [STORAGE_KEY]: data });
  await syncTask(task);
  chrome.notifications.create(`planbar-captured-${task.id}`, {
    type: "basic",
    iconUrl: "assets/icon-128.png",
    title: t("bg.captured", {}, language),
    message: task.title,
  });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === MAINTENANCE_ALARM) return void (await requestReschedule());
  if (alarm.name === FOCUS_ALARM) return void (await notifyFocusComplete());
  if (alarm.name === AUTO_ARCHIVE_ALARM) return void (await requestReschedule());
  if (!alarm.name.startsWith(ALARM_PREFIX)) return;
  const [, taskId, occurrenceDate] = alarm.name.split(":");
  const data = await getLocalData();
  const language = languageOf(data);
  const task = (data.tasks || []).find((item) => item.id === taskId);
  if (!task || task.archivedAt || isOccurrenceComplete(task, occurrenceDate)) return;
  const category = (data.categories || []).find((item) => item.id === task.category)?.label || t("common.tasks", {}, language);
  const when = occurrenceDate === todayString() ? t("common.today", {}, language) : formatDate(occurrenceDate, language);
  chrome.notifications.create(alarm.name, {
    type: "basic",
    iconUrl: "assets/icon-128.png",
    title: task.title,
    message: `${task.time ? t("bg.atTime", { when, time: task.time }, language) : when} · ${category}`,
    priority: task.priority === "high" ? 2 : 0,
  });
});

chrome.notifications.onClicked.addListener((notificationId) => {
  chrome.notifications.clear(notificationId);
  if (!notificationId.startsWith(ALARM_PREFIX)) return;
  const [, taskId, occurrenceDate] = notificationId.split(":");
  chrome.tabs.create({
    url: chrome.runtime.getURL(`sidepanel.html?mode=tab&task=${encodeURIComponent(taskId)}&date=${encodeURIComponent(occurrenceDate)}`),
  });
});

async function refreshContextMenu(language) {
  await new Promise((resolve) => chrome.contextMenus.removeAll(resolve));
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: t("bg.contextMenu", {}, language),
    contexts: ["selection"],
  });
}

// Storage writes arrive in bursts; coalesce them so a single toggle never races two full rebuilds.
function requestReschedule() {
  if (schedulingRun) {
    schedulingDirty = true;
    return schedulingRun;
  }
  schedulingRun = (async () => {
    try {
      do {
        schedulingDirty = false;
        await scheduleReminders();
      } while (schedulingDirty);
    } finally {
      schedulingRun = null;
    }
  })();
  return schedulingRun;
}

async function scheduleReminders() {
  const data = await archiveDueTasks(await getLocalData());
  const desired = collectReminders(data.tasks || []);
  const archiveAt = nextAutoArchiveTime(data);
  const existing = await chrome.alarms.getAll();
  const keep = new Set();
  let keepArchiveAlarm = false;

  for (const alarm of existing) {
    if (alarm.name === AUTO_ARCHIVE_ALARM) {
      if (archiveAt && Math.abs(alarm.scheduledTime - archiveAt) <= ALARM_DRIFT_TOLERANCE) keepArchiveAlarm = true;
      else await chrome.alarms.clear(alarm.name);
      continue;
    }
    if (!alarm.name.startsWith(ALARM_PREFIX)) continue;
    const target = desired.get(alarm.name);
    if (target !== undefined && Math.abs(alarm.scheduledTime - target) <= ALARM_DRIFT_TOLERANCE) keep.add(alarm.name);
    else await chrome.alarms.clear(alarm.name);
  }
  for (const [name, when] of desired) {
    if (!keep.has(name)) await chrome.alarms.create(name, { when });
  }
  if (archiveAt && !keepArchiveAlarm) await chrome.alarms.create(AUTO_ARCHIVE_ALARM, { when: archiveAt });
}

async function archiveDueTasks(data, now = Date.now()) {
  const delay = autoArchiveDelayMs(data);
  if (!delay) return data;
  const changed = [];
  for (const task of data.tasks || []) {
    if (task.archivedAt || task.repeat !== "none" || !task.completed || !Number(task.completedAt)) continue;
    if (task.completedAt + delay > now) continue;
    task.archivedAt = now;
    task.updatedAt = now;
    changed.push(task);
  }
  if (!changed.length) return data;
  data.updatedAt = now;
  await chrome.storage.local.set({ [STORAGE_KEY]: data });
  await Promise.all(changed.map(syncTask));
  return data;
}

function nextAutoArchiveTime(data) {
  const delay = autoArchiveDelayMs(data);
  if (!delay) return 0;
  return (data.tasks || []).reduce((next, task) => {
    if (task.archivedAt || task.repeat !== "none" || !task.completed || !Number(task.completedAt)) return next;
    const due = task.completedAt + delay;
    return !next || due < next ? due : next;
  }, 0);
}

function collectReminders(tasks) {
  const now = Date.now();
  const horizon = addDays(new Date(), REMINDER_WINDOW_DAYS);
  const found = [];

  for (const task of tasks) {
    if (task.archivedAt) continue;
    const minutes = Number(task.reminder);
    if (!Number.isFinite(minutes) || !isValidDate(task.date) || !safeTime(task.time)) continue;
    if (!task.repeat || task.repeat === "none") {
      if (task.completed) continue;
      const fireAt = occurrenceTime(task.date, task.time) - minutes * 60000;
      if (fireAt > now) found.push([`${ALARM_PREFIX}${task.id}:${task.date}`, fireAt]);
      continue;
    }
    let added = 0;
    for (let cursor = new Date(); cursor <= horizon && added < MAX_OCCURRENCES_PER_TASK; cursor = addDays(cursor, 1)) {
      const value = dateString(cursor);
      if (!occursOn(task, value) || isOccurrenceComplete(task, value)) continue;
      const fireAt = occurrenceTime(value, task.time) - minutes * 60000;
      if (fireAt <= now) continue;
      found.push([`${ALARM_PREFIX}${task.id}:${value}`, fireAt]);
      added += 1;
    }
  }

  found.sort((a, b) => a[1] - b[1]);
  if (found.length > MAX_REMINDER_ALARMS) {
    console.warn(`Planbar: ${found.length - MAX_REMINDER_ALARMS} reminder(s) beyond the nearest ${MAX_REMINDER_ALARMS} were skipped; they are rescheduled daily.`);
  }
  return new Map(found.slice(0, MAX_REMINDER_ALARMS));
}

// The side panel unloads when it closes, so the focus timer finishes here instead.
async function notifyFocusComplete() {
  const stored = (await chrome.storage.local.get(FOCUS_KEY))[FOCUS_KEY];
  if (!stored?.running) return;
  await chrome.storage.local.set({ [FOCUS_KEY]: { ...stored, running: false, remaining: 0 } });
  const data = await getLocalData();
  const language = languageOf(data);
  const task = (data.tasks || []).find((item) => item.id === stored.taskId);
  const message = stored.mode === "focus"
    ? (task ? t("focus.roundDoneTask", { title: task.title }, language) : t("focus.roundDone", {}, language))
    : t("focus.breakDone", {}, language);
  chrome.notifications.create(`planbar-focus-${stored.deadline}`, {
    type: "basic",
    iconUrl: "assets/icon-128.png",
    title: t("focus.notificationTitle", {}, language),
    message,
  });
}

async function getLocalData() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || { tasks: [] };
}

function languageOf(data) {
  return data?.language === "en" ? "en" : "de";
}

async function syncTask(task) {
  try {
    await chrome.storage.sync.set({ [`${SYNC_TASK_PREFIX}${task.id}`]: task });
  } catch {
    // Local storage remains the source of truth if the sync quota is unavailable.
  }
}

function formatDate(value, language) {
  return parseDate(value).toLocaleDateString(language === "en" ? "en-US" : "de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

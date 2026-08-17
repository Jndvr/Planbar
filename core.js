globalThis.PlanbarCore = (() => {
  const STORAGE_KEY = "planbarData";
  const SYNC_META_KEY = "planbarMeta";
  const SYNC_TASK_PREFIX = "planbarTask_";
  const FOCUS_KEY = "planbarFocus";
  const ALARM_PREFIX = "planbar:";
  const FOCUS_ALARM = "planbar-focus";
  const AUTO_ARCHIVE_ALARM = "planbar-auto-archive";
  const MAINTENANCE_ALARM = "planbar-maintenance";
  const CONTEXT_MENU_ID = "planbar-add-selection";

  const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
  const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
  const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
  const REMINDERS = ["none", "0", "5", "15", "30", "60", "1440"];
  const AUTO_ARCHIVE_UNITS = { hours: 3600000, days: 86400000, weeks: 604800000 };

  function dateString(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function todayString() {
    return dateString(new Date());
  }

  // Anchored at noon so day arithmetic survives daylight-saving transitions.
  function parseDate(value) {
    const [year, month, day] = String(value).split("-").map(Number);
    return new Date(year, month - 1, day, 12);
  }

  function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  function startOfWeek(date) {
    const result = new Date(date);
    const day = result.getDay() || 7;
    result.setDate(result.getDate() - day + 1);
    return result;
  }

  function daysInMonth(year, monthIndex) {
    return new Date(year, monthIndex + 1, 0).getDate();
  }

  function isValidDate(value) {
    if (!DATE_PATTERN.test(String(value || ""))) return false;
    const [year, month, day] = String(value).split("-").map(Number);
    return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month - 1);
  }

  // Untrusted input (imported backups, synced payloads) must never reach an HTML attribute unchecked.
  function safeId(value) {
    return ID_PATTERN.test(String(value ?? "")) ? String(value) : "";
  }

  function safeDate(value, fallback = todayString()) {
    return isValidDate(value) ? String(value) : fallback;
  }

  function safeTime(value) {
    return TIME_PATTERN.test(String(value ?? "")) ? String(value) : "";
  }

  function safeReminder(value) {
    return REMINDERS.includes(String(value ?? "none")) ? String(value) : "none";
  }

  function occursOn(task, value) {
    if (!task?.date || value < task.date) return false;
    const repeat = task.repeat || "none";
    if (repeat === "none") return task.date === value;
    const start = parseDate(task.date);
    const date = parseDate(value);
    if (repeat === "daily") return true;
    if (repeat === "weekly") return Math.round((date - start) / 86400000) % 7 === 0;
    // A task starting on the 31st still recurs in shorter months, clamped to the last day.
    if (repeat === "monthly") return date.getDate() === Math.min(start.getDate(), daysInMonth(date.getFullYear(), date.getMonth()));
    return false;
  }

  function isOccurrenceComplete(task, date) {
    return task.repeat && task.repeat !== "none" ? (task.completionDates || []).includes(date) : Boolean(task.completed);
  }

  function occurrenceTime(value, time) {
    const date = parseDate(value);
    const [hours, minutes] = String(time).split(":").map(Number);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes).getTime();
  }

  function autoArchiveConfig(data = {}) {
    const unit = Object.hasOwn(AUTO_ARCHIVE_UNITS, data.autoArchiveUnit) ? data.autoArchiveUnit : (Number.isFinite(Number(data.autoArchiveDays)) ? "days" : "hours");
    const fallback = Number.isFinite(Number(data.autoArchiveDays)) ? Number(data.autoArchiveDays) : 48;
    const rawValue = Number.isFinite(Number(data.autoArchiveValue)) ? Number(data.autoArchiveValue) : fallback;
    return { value: Math.min(9999, Math.max(0, Math.round(rawValue * 100) / 100)), unit };
  }

  function autoArchiveDelayMs(data = {}) {
    const config = autoArchiveConfig(data);
    return config.value * AUTO_ARCHIVE_UNITS[config.unit];
  }

  return {
    STORAGE_KEY, SYNC_META_KEY, SYNC_TASK_PREFIX, FOCUS_KEY,
    ALARM_PREFIX, FOCUS_ALARM, AUTO_ARCHIVE_ALARM, MAINTENANCE_ALARM, CONTEXT_MENU_ID,
    dateString, todayString, parseDate, addDays, startOfWeek, daysInMonth,
    isValidDate, safeId, safeDate, safeTime, safeReminder,
    occursOn, isOccurrenceComplete, occurrenceTime, autoArchiveConfig, autoArchiveDelayMs,
  };
})();

const {
  STORAGE_KEY, SYNC_META_KEY, SYNC_TASK_PREFIX, FOCUS_KEY, FOCUS_ALARM,
  dateString, todayString, parseDate, addDays, startOfWeek,
  isValidDate, safeId, safeDate, safeTime, safeReminder,
  occursOn, isOccurrenceComplete, autoArchiveConfig, autoArchiveDelayMs,
} = globalThis.PlanbarCore;
const { t: translate, apply: applyTranslations } = globalThis.PlanbarI18n;

// chrome.storage.sync allows 512 items; stay clear of the ceiling so writes keep succeeding.
const SYNC_TASK_LIMIT = 400;
const DELETION_RETENTION_DAYS = 60;
const DELETION_LIMIT = 150;

const DEFAULT_CATEGORIES = [
  { id: "work", label: "Arbeit", color: "#4f8b69", isDefault: true },
  { id: "personal", label: "Privat", color: "#8b6fb0", isDefault: true },
  { id: "health", label: "Gesundheit", color: "#d66f64", isDefault: true },
  { id: "learning", label: "Lernen", color: "#4f83b8", isDefault: true },
  { id: "other", label: "Sonstiges", color: "#9a8c70", isDefault: true },
];

const state = {
  tasks: [],
  categories: DEFAULT_CATEGORIES.map((item) => ({ ...item })),
  deletions: {},
  view: "day",
  selectedDate: todayString(),
  filter: "open",
  search: "",
  theme: "light",
  language: "de",
  autoArchiveValue: 48,
  autoArchiveUnit: "hours",
};

const focusState = {
  mode: "focus",
  total: 25 * 60,
  remaining: 25 * 60,
  running: false,
  deadline: 0,
  interval: null,
};

const elements = {
  shell: document.querySelector(".app-shell"),
  main: document.querySelector("#mainContent"),
  tabs: [...document.querySelectorAll(".view-tab")],
  addButton: document.querySelector("#addButton"),
  saveTabButton: document.querySelector("#saveTabButton"),
  taskSheet: document.querySelector("#taskSheet"),
  taskBackdrop: document.querySelector("#taskBackdrop"),
  taskForm: document.querySelector("#taskForm"),
  sheetTitle: document.querySelector("#sheetTitle"),
  closeSheet: document.querySelector("#closeSheet"),
  deleteTask: document.querySelector("#deleteTask"),
  archiveTask: document.querySelector("#archiveTask"),
  restoreTask: document.querySelector("#restoreTask"),
  taskId: document.querySelector("#taskId"),
  taskTitle: document.querySelector("#taskTitle"),
  taskDate: document.querySelector("#taskDate"),
  taskTime: document.querySelector("#taskTime"),
  taskCategory: document.querySelector("#taskCategory"),
  taskRepeat: document.querySelector("#taskRepeat"),
  taskReminder: document.querySelector("#taskReminder"),
  taskNotes: document.querySelector("#taskNotes"),
  smartHint: document.querySelector("#smartHint"),
  subtaskList: document.querySelector("#subtaskList"),
  dependencySearch: document.querySelector("#dependencySearch"),
  dependencySummary: document.querySelector("#dependencySummary"),
  dependencyList: document.querySelector("#dependencyList"),
  addSubtask: document.querySelector("#addSubtask"),
  searchButton: document.querySelector("#searchButton"),
  focusButton: document.querySelector("#focusButton"),
  openTabButton: document.querySelector("#openTabButton"),
  searchPanel: document.querySelector("#searchPanel"),
  searchInput: document.querySelector("#searchInput"),
  clearSearch: document.querySelector("#clearSearch"),
  themeButton: document.querySelector("#themeButton"),
  brandButton: document.querySelector("#brandButton"),
  settingsButton: document.querySelector("#settingsButton"),
  infoSheet: document.querySelector("#infoSheet"),
  infoBackdrop: document.querySelector("#infoBackdrop"),
  closeInfo: document.querySelector("#closeInfo"),
  languageSelect: document.querySelector("#languageSelect"),
  autoArchiveValue: document.querySelector("#autoArchiveValue"),
  autoArchiveUnit: document.querySelector("#autoArchiveUnit"),
  categoryList: document.querySelector("#categoryList"),
  addCategory: document.querySelector("#addCategory"),
  exportData: document.querySelector("#exportData"),
  importData: document.querySelector("#importData"),
  importFile: document.querySelector("#importFile"),
  focusSheet: document.querySelector("#focusSheet"),
  focusBackdrop: document.querySelector("#focusBackdrop"),
  closeFocus: document.querySelector("#closeFocus"),
  focusTask: document.querySelector("#focusTask"),
  timerRing: document.querySelector("#timerRing"),
  timerDisplay: document.querySelector("#timerDisplay"),
  timerStatus: document.querySelector("#timerStatus"),
  startTimer: document.querySelector("#startTimer"),
  resetTimer: document.querySelector("#resetTimer"),
  timerTabs: [...document.querySelectorAll("[data-timer-mode]")],
  toast: document.querySelector("#toast"),
  trashDropZone: document.querySelector("#trashDropZone"),
};

let toastTimer;
let draggedTaskId = "";
let storageReloadTimer;
let dependencySelection = new Set();
let lastDeletedTask = null;
let lastWriteStamp = 0;
let syncLimitWarned = false;
let focusPendingTaskId = "";
const dialogStack = [];

init();

async function init() {
  const params = new URLSearchParams(location.search);
  if (params.get("mode") === "tab") document.documentElement.dataset.mode = "tab";

  const saved = await loadData();
  applySavedData(saved);
  if (isValidDate(params.get("date"))) state.selectedDate = params.get("date");
  applyTheme();
  applyLanguage();
  const archived = autoArchiveTasks();
  populateCategorySelect();
  bindStaticEvents();
  bindStorageUpdates();
  render();
  await restoreFocusSession();
  if (archived) await persist();
  if (params.get("task")) openTaskSheet(safeId(params.get("task")));
}

function applySavedData(saved) {
  state.theme = saved.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const browserLanguage = globalThis.navigator?.language?.toLowerCase().startsWith("en") ? "en" : "de";
  state.language = ["de", "en"].includes(saved.language) ? saved.language : browserLanguage;
  const archiveConfig = autoArchiveConfig(saved);
  state.autoArchiveValue = archiveConfig.value;
  state.autoArchiveUnit = archiveConfig.unit;
  // Remember which stored revision this state came from, so later writes can tell foreign changes apart.
  lastWriteStamp = Number(saved.updatedAt) || lastWriteStamp;
  state.deletions = pruneDeletions(saved.deletions);
  state.tasks = Array.isArray(saved.tasks) ? saved.tasks.map(normalizeTask) : [];
  state.categories = Array.isArray(saved.categories) && saved.categories.length
    ? saved.categories.map(normalizeCategory)
    : DEFAULT_CATEGORIES.map((item) => ({ ...item }));
}

function normalizeTask(task) {
  return {
    ...task,
    id: safeId(task.id) || crypto.randomUUID(),
    title: String(task.title || "Untitled task").slice(0, 120),
    date: safeDate(task.date),
    time: safeTime(task.time),
    priority: ["low", "medium", "high"].includes(task.priority) ? task.priority : "medium",
    category: safeId(task.category) || "other",
    repeat: ["none", "daily", "weekly", "monthly"].includes(task.repeat) ? task.repeat : "none",
    reminder: safeReminder(task.reminder),
    notes: String(task.notes || "").slice(0, 500),
    subtasks: Array.isArray(task.subtasks) ? task.subtasks.map((item) => ({
      id: safeId(item.id) || crypto.randomUUID(),
      title: String(item.title || "").slice(0, 120),
      completed: Boolean(item.completed),
    })).filter((item) => item.title) : [],
    completed: Boolean(task.completed),
    completedAt: Number(task.completedAt) || null,
    completionDates: Array.isArray(task.completionDates) ? [...new Set(task.completionDates.filter(isValidDate))] : [],
    dependencyIds: Array.isArray(task.dependencyIds) ? [...new Set(task.dependencyIds.map(safeId).filter(Boolean))] : [],
    archivedAt: task.archivedAt ? Number(task.archivedAt) : null,
    createdAt: Number(task.createdAt) || Date.now(),
    updatedAt: Number(task.updatedAt) || Date.now(),
  };
}

function normalizeCategory(category) {
  return {
    id: safeId(category.id) || crypto.randomUUID(),
    label: String(category.label || "").slice(0, 32) || t("category.fallback"),
    color: validColor(category.color) ? category.color : "#4f8b69",
    isDefault: Boolean(category.isDefault || DEFAULT_CATEGORIES.some((item) => item.id === category.id)),
  };
}

function mergeTaskLists(...lists) {
  const merged = new Map();
  for (const list of lists) {
    for (const item of Array.isArray(list) ? list : []) {
      const task = normalizeTask(item);
      const existing = merged.get(task.id);
      if (!existing || task.updatedAt >= existing.updatedAt) merged.set(task.id, task);
    }
  }
  return [...merged.values()];
}

function mergeDeletions(...maps) {
  const merged = {};
  for (const map of maps) {
    for (const [id, value] of Object.entries(map || {})) {
      const stamp = Number(value) || 0;
      if (!safeId(id) || stamp <= (merged[id] || 0)) continue;
      merged[id] = stamp;
    }
  }
  return merged;
}

// A tombstone only wins over a task that has not been edited since it was deleted.
function applyDeletions(tasks, deletions) {
  return tasks.filter((task) => (deletions[task.id] || 0) < task.updatedAt);
}

function pruneDeletions(deletions) {
  const cutoff = Date.now() - DELETION_RETENTION_DAYS * 86400000;
  return Object.fromEntries(Object.entries(mergeDeletions(deletions))
    .filter(([, stamp]) => stamp > cutoff)
    .sort((a, b) => b[1] - a[1])
    .slice(0, DELETION_LIMIT));
}

function t(key, values = {}) { return translate(key, values, state.language); }
function locale() { return state.language === "en" ? "en-US" : "de-DE"; }
function categoryLabel(category) { return category?.isDefault ? t(`category.${category.id}`) : category?.label || t("category.other"); }

function applyLanguage() {
  applyTranslations(document, state.language);
  elements.languageSelect.value = state.language;
  elements.autoArchiveValue.value = String(state.autoArchiveValue);
  elements.autoArchiveUnit.value = state.autoArchiveUnit;
}

function bindStaticEvents() {
  elements.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      state.view = tab.dataset.view;
      state.search = "";
      elements.searchInput.value = "";
      elements.searchPanel.hidden = true;
      elements.tabs.forEach((item) => item.classList.toggle("active", item === tab));
      render();
    });
  });

  elements.addButton.addEventListener("click", () => openTaskSheet());
  elements.saveTabButton.addEventListener("click", captureCurrentTab);
  elements.closeSheet.addEventListener("click", closeTaskSheet);
  elements.taskBackdrop.addEventListener("click", closeTaskSheet);
  elements.taskForm.addEventListener("submit", saveTaskFromForm);
  elements.deleteTask.addEventListener("click", handleDelete);
  elements.archiveTask.addEventListener("click", archiveCurrentTask);
  elements.restoreTask.addEventListener("click", restoreCurrentTask);
  elements.addSubtask.addEventListener("click", () => addSubtaskRow());
  elements.taskTitle.addEventListener("input", updateSmartHint);
  elements.taskTitle.addEventListener("blur", () => applySmartInput(false));
  elements.dependencySearch.addEventListener("input", () => {
    const task = state.tasks.find((item) => item.id === elements.taskId.value);
    renderDependencyOptions(task, elements.dependencySearch.value);
  });
  document.querySelectorAll("[data-quick-date]").forEach((button) => {
    button.addEventListener("click", () => applyQuickDate(button.dataset.quickDate));
  });

  elements.searchButton.addEventListener("click", openSearch);
  elements.focusButton.addEventListener("click", () => openFocus());
  elements.openTabButton.addEventListener("click", openFullTab);
  elements.clearSearch.addEventListener("click", closeSearch);
  elements.searchInput.addEventListener("input", (event) => {
    state.search = event.target.value.trim().toLocaleLowerCase(locale());
    render();
  });
  elements.themeButton.addEventListener("click", toggleTheme);
  elements.brandButton.addEventListener("click", jumpToToday);

  elements.settingsButton.addEventListener("click", openInfo);
  elements.closeInfo.addEventListener("click", closeInfo);
  elements.infoBackdrop.addEventListener("click", closeInfo);
  elements.languageSelect.addEventListener("change", async () => {
    state.language = elements.languageSelect.value === "en" ? "en" : "de";
    applyLanguage();
    populateCategorySelect();
    renderCategorySettings();
    await persist();
    render();
  });
  const updateAutoArchive = async () => {
    const config = autoArchiveConfig({ autoArchiveValue: elements.autoArchiveValue.value, autoArchiveUnit: elements.autoArchiveUnit.value });
    state.autoArchiveValue = config.value;
    state.autoArchiveUnit = config.unit;
    elements.autoArchiveValue.value = String(config.value);
    autoArchiveTasks();
    await persist();
    render();
  };
  elements.autoArchiveValue.addEventListener("change", updateAutoArchive);
  elements.autoArchiveUnit.addEventListener("change", updateAutoArchive);
  elements.addCategory.addEventListener("click", addCategory);
  elements.exportData.addEventListener("click", exportBackup);
  elements.importData.addEventListener("click", () => elements.importFile.click());
  elements.importFile.addEventListener("change", importBackup);

  elements.closeFocus.addEventListener("click", closeFocus);
  elements.focusBackdrop.addEventListener("click", closeFocus);
  elements.startTimer.addEventListener("click", toggleTimer);
  elements.resetTimer.addEventListener("click", resetTimer);
  elements.timerTabs.forEach((button) => button.addEventListener("click", () => setTimerMode(button.dataset.timerMode)));
  elements.trashDropZone.addEventListener("dragover", (event) => {
    if (!draggedTaskId) return;
    event.preventDefault();
    event.stopPropagation();
    elements.trashDropZone.classList.add("active");
    elements.trashDropZone.querySelector("span").textContent = t("drag.deleteActive");
  });
  elements.trashDropZone.addEventListener("dragleave", () => {
    elements.trashDropZone.classList.remove("active");
    elements.trashDropZone.querySelector("span").textContent = t("drag.delete");
  });
  elements.trashDropZone.addEventListener("drop", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const id = draggedTaskId;
    clearDragState();
    if (id) await deleteTaskWithUndo(id);
  });

  document.addEventListener("keydown", (event) => {
    const command = event.metaKey || event.ctrlKey;
    const dialog = topDialog();
    if (command && event.key === "Enter") {
      event.preventDefault();
      if (!dialog) openTaskSheet();
      else if (dialog.sheet === elements.taskSheet) elements.taskForm.requestSubmit?.();
      return;
    }
    if (command && event.key.toLowerCase() === "k") {
      if (dialog) return;
      event.preventDefault();
      openSearch();
      return;
    }
    if (event.key === "Tab" && dialog) trapFocus(event, dialog.sheet);
    if (event.key !== "Escape") return;
    if (dialog) {
      event.preventDefault();
      closeDialog(dialog.sheet);
      return;
    }
    if (!elements.searchPanel.hidden) closeSearch();
  });
}

// One dialog at a time: the shell goes inert, Escape closes only the top sheet, focus returns where it was.
function openDialog(sheet, backdrop, focusTarget) {
  if (dialogStack.some((entry) => entry.sheet === sheet)) return;
  const previous = document.activeElement;
  sheet.hidden = false;
  backdrop.hidden = false;
  // Blur before the shell turns inert, otherwise Chrome's focus fixup resets focus to the body afterwards.
  previous?.blur?.();
  if (elements.shell) elements.shell.inert = true;
  dialogStack.push({ sheet, backdrop, previous });
  if (focusTarget) requestAnimationFrame(() => focusTarget.focus());
}

function closeDialog(sheet) {
  const index = dialogStack.findIndex((entry) => entry.sheet === sheet);
  if (index < 0) return;
  const [entry] = dialogStack.splice(index, 1);
  entry.sheet.hidden = true;
  entry.backdrop.hidden = true;
  if (elements.shell && !dialogStack.length) elements.shell.inert = false;
  entry.previous?.focus?.();
}

function topDialog() {
  return dialogStack[dialogStack.length - 1];
}

function trapFocus(event, sheet) {
  const focusable = [...sheet.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    .filter((element) => !element.hidden && element.offsetParent !== null);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function bindStorageUpdates() {
  if (!globalThis.chrome?.storage?.onChanged) return;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[STORAGE_KEY]?.newValue) {
      const incoming = changes[STORAGE_KEY].newValue;
      if ((Number(incoming.updatedAt) || 0) === lastWriteStamp) return;
      applySnapshot(mergeIntoState(incoming));
      return;
    }
    if (area === "sync" && Object.keys(changes).some((key) => key === SYNC_META_KEY || key.startsWith(SYNC_TASK_PREFIX))) {
      if ((Number(changes[SYNC_META_KEY]?.newValue?.updatedAt) || 0) === lastWriteStamp) return;
      clearTimeout(storageReloadTimer);
      storageReloadTimer = setTimeout(async () => applySnapshot(await loadData()), 350);
    }
  });
}

function currentSnapshot() {
  return {
    tasks: state.tasks,
    categories: state.categories,
    deletions: state.deletions,
    theme: state.theme,
    language: state.language,
    autoArchiveValue: state.autoArchiveValue,
    autoArchiveUnit: state.autoArchiveUnit,
    updatedAt: lastWriteStamp,
  };
}

// Never let an incoming payload replace local tasks outright — merge per task and let tombstones decide.
function mergeIntoState(incoming) {
  const deletions = pruneDeletions(mergeDeletions(state.deletions, incoming.deletions));
  const mine = currentSnapshot();
  const base = (Number(incoming.updatedAt) || 0) > lastWriteStamp ? { ...mine, ...incoming } : { ...incoming, ...mine };
  // Ours is listed last so an equal timestamp keeps the copy the user is looking at.
  return { ...base, deletions, tasks: applyDeletions(mergeTaskLists(incoming.tasks, state.tasks), deletions) };
}

function applySnapshot(snapshot) {
  applySavedData(snapshot);
  applyTheme();
  applyLanguage();
  populateCategorySelect();
  render();
}

function render() {
  if (state.search) return renderSearchResults();
  if (state.view === "archive") renderArchiveView();
  else if (state.view === "week") renderWeekView();
  else if (state.view === "month") renderMonthView();
  else renderDayView();
}

function renderDayView() {
  const date = parseDate(state.selectedDate);
  const all = occurrencesForDate(state.selectedDate);
  const completed = all.filter((item) => isOccurrenceComplete(item.task, state.selectedDate)).length;
  const filtered = filterOccurrences(all, state.selectedDate);
  const percent = all.length ? Math.round((completed / all.length) * 100) : 0;
  const greeting = relativeDayLabel(date);
  const overdue = state.selectedDate === todayString() ? overdueOccurrences() : [];

  elements.main.innerHTML = `
    <section class="hero">
      <div class="hero-top">
        <div>
          <p class="eyebrow">${escapeHtml(greeting.eyebrow)}</p>
          <h1>${escapeHtml(greeting.title)}</h1>
          <p class="hero-subtitle">${daySummary(all.length, completed)}</p>
        </div>
        ${renderProgressRing(percent)}
      </div>
      ${renderDateControls(formatLongDate(date))}
    </section>
    ${renderWeekStrip(date)}
    ${overdue.length && state.filter !== "done" ? renderOverdue(overdue) : ""}
    ${all.length ? renderSummaryCard(all, completed, date) : ""}
    ${renderListSection(filtered, all.length, t("section.tasks"))}
  `;
  bindDynamicEvents();
}

function renderWeekView() {
  const date = parseDate(state.selectedDate);
  const monday = startOfWeek(date);
  const days = Array.from({ length: 7 }, (_, index) => addDays(monday, index));
  const weekItems = days.flatMap((day) => occurrencesForDate(dateString(day)).map((item) => ({ ...item, occurrenceDate: dateString(day) })));
  const completed = weekItems.filter((item) => isOccurrenceComplete(item.task, item.occurrenceDate)).length;
  const percent = weekItems.length ? Math.round((completed / weekItems.length) * 100) : 0;
  const weekNumber = getWeekNumber(date);

  elements.main.innerHTML = `
    <section class="hero">
      <div class="hero-top">
        <div>
          <p class="eyebrow">${t("week.label", { number: weekNumber })}</p>
          <h1>${t("week.title")}</h1>
          <p class="hero-subtitle">${weekItems.length ? t("week.progress", { done: completed, total: weekItems.length }) : t("week.free")}</p>
        </div>
        ${renderProgressRing(percent)}
      </div>
      ${renderDateControls(`${formatShortDate(monday)} – ${formatShortDate(days[6])}`)}
    </section>
    ${renderWeekStrip(date)}
    ${weekItems.length ? renderSummaryCard(weekItems, completed, date, true) : ""}
    <div class="week-groups">${days.map((day) => renderDayGroup(day)).join("")}</div>
  `;
  bindDynamicEvents();
}

function renderMonthView() {
  const selected = parseDate(state.selectedDate);
  const first = new Date(selected.getFullYear(), selected.getMonth(), 1);
  const gridStart = startOfWeek(first);
  const days = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
  const selectedItems = occurrencesForDate(state.selectedDate);
  const filtered = filterOccurrences(selectedItems, state.selectedDate);

  elements.main.innerHTML = `
    <section class="hero">
      <div class="hero-top">
        <div>
          <p class="eyebrow">${t("month.label")}</p>
          <h1>${capitalize(first.toLocaleDateString(locale(), { month: "long" }))}</h1>
          <p class="hero-subtitle">${t("month.subtitle")}</p>
        </div>
        <div class="summary-number">${first.getFullYear()}</div>
      </div>
      ${renderDateControls(first.toLocaleDateString(locale(), { month: "long", year: "numeric" }))}
    </section>
    <div class="month-grid" role="group" aria-label="${escapeHtml(t("aria.monthGrid"))}">
      ${Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(new Date()), index).toLocaleDateString(locale(), { weekday: "short" }).replace(".", "")).map((day) => `<div class="month-weekday" aria-hidden="true">${escapeHtml(day)}</div>`).join("")}
      ${days.map((day) => renderMonthDay(day, selected)).join("")}
    </div>
    ${renderListSection(filtered, selectedItems.length, formatAgendaTitle(selected))}
  `;
  bindDynamicEvents();
}

function renderSearchResults() {
  const results = state.tasks
    .filter((task) => !task.archivedAt && [task.title, task.notes, categoryLabel(getCategory(task.category)), ...(task.subtasks || []).map((item) => item.title)].join(" ").toLocaleLowerCase(locale()).includes(state.search))
    .sort(sortTasks)
    .map((task) => ({ task, occurrenceDate: task.date }));
  elements.main.innerHTML = `
    <section class="hero">
      <p class="eyebrow">${t("search.title")}</p>
      <h1>${t("search.results", { count: results.length })}</h1>
      <p class="hero-subtitle">${t("search.for", { query: escapeHtml(elements.searchInput.value.trim()) })}</p>
    </section>
    <div class="task-list">${results.length ? results.map(renderTaskCard).join("") : renderEmpty(t("search.none"), t("search.try"))}</div>`;
  bindDynamicEvents();
}

function renderArchiveView() {
  const archived = state.tasks.filter((task) => task.archivedAt).sort((a, b) => b.archivedAt - a.archivedAt);
  elements.main.innerHTML = `<section class="hero"><p class="eyebrow">${t("nav.archive").toUpperCase()}</p><h1>${t("archive.title")}</h1><p class="hero-subtitle">${t("archive.subtitle")}</p></section>
    <div class="task-list">${archived.length ? archived.map((task) => renderTaskCard({ task, occurrenceDate: task.date })).join("") : renderEmpty(t("archive.empty"), t("archive.emptyText"))}</div>`;
  bindDynamicEvents();
}

function renderProgressRing(percent) {
  return `<div class="progress-ring" role="img" style="--progress:${percent * 3.6}deg" aria-label="${escapeHtml(t("aria.progress", { percent }))}"><span>${percent}%</span></div>`;
}

function renderDateControls(label) {
  return `<div class="date-controls">
    <button class="nav-btn" data-nav="prev" aria-label="${escapeHtml(t("aria.previous"))}">‹</button>
    <span class="date-label">${escapeHtml(label)}</span>
    <button class="today-btn" data-nav="today">${t("common.today")}</button>
    <button class="nav-btn" data-nav="next" aria-label="${escapeHtml(t("aria.next"))}">›</button>
  </div>`;
}

function renderWeekStrip(selected) {
  const monday = startOfWeek(selected);
  return `<div class="week-strip" role="group" aria-label="${escapeHtml(t("aria.weekdays"))}">${Array.from({ length: 7 }, (_, index) => {
    const day = addDays(monday, index);
    const value = dateString(day);
    const count = occurrencesForDate(value).length;
    return `<button class="day-pill ${sameDay(day, selected) ? "selected" : ""} ${value === todayString() ? "today" : ""}" data-date="${escapeHtml(value)}"
      aria-label="${escapeHtml(dayButtonLabel(day, count))}" aria-pressed="${sameDay(day, selected)}"${value === todayString() ? ' aria-current="date"' : ""}>
      <span class="weekday" aria-hidden="true">${escapeHtml(day.toLocaleDateString(locale(), { weekday: "short" }).replace(".", ""))}</span>
      <span class="day-number" aria-hidden="true">${day.getDate()}</span>${count ? '<span class="day-dot"></span>' : ""}
    </button>`;
  }).join("")}</div>`;
}

function dayButtonLabel(day, count) {
  if (!count) return formatLongDate(day);
  return `${formatLongDate(day)}, ${t(count === 1 ? "aria.taskCountOne" : "aria.taskCount", { count })}`;
}

function renderSummaryCard(items, completed, date, isWeek = false) {
  const open = items.length - completed;
  const high = items.filter((item) => item.task.priority === "high" && !isOccurrenceComplete(item.task, item.occurrenceDate || dateString(date))).length;
  return `<div class="summary-card">
    <strong>${open ? t(open === 1 ? "summary.openOne" : "summary.openMany", { count: open }) : t("summary.done")}</strong>
    <span class="summary-number">${items.length ? Math.round((completed / items.length) * 100) : 0}%</span>
    <p>${high ? t("summary.high", { count: high }) : isWeek ? t("summary.week") : t("summary.pace")}</p>
  </div>`;
}

function renderOverdue(items) {
  return `<section class="overdue-block">
    <div class="section-head"><div><h2>${t("overdue.title")}</h2><span class="task-count">${t("overdue.reschedule", { count: items.length })}</span></div></div>
    <div class="task-list">${items.map((item) => renderTaskCard(item)).join("")}</div>
  </section>`;
}

function renderListSection(items, total, title) {
  return `<div class="section-head">
      <div><h2>${escapeHtml(title)}</h2><span class="task-count">${total} ${t("common.total")}</span></div>${renderFilters()}
    </div>
    <div class="task-list">${items.length ? items.map(renderTaskCard).join("") : renderEmpty(
      state.filter === "done" ? t("empty.noDone") : state.filter === "all" && total === 0 ? t("empty.free") : t("empty.allDone"),
      state.filter === "done" ? t("empty.doneLater") : total === 0 ? t("empty.plan") : t("empty.strong")
    )}</div>`;
}

function renderFilters() {
  const chip = (value, label) => `<button class="filter-chip ${state.filter === value ? "active" : ""}" data-filter="${value}" aria-pressed="${state.filter === value}">${label}</button>`;
  return `<div class="filter-row" role="group" aria-label="${escapeHtml(t("aria.filter"))}">
    ${chip("open", t("common.open"))}
    ${chip("all", t("common.all"))}
    ${chip("done", t("common.done"))}
  </div>`;
}

function renderDayGroup(day) {
  const value = dateString(day);
  const all = occurrencesForDate(value);
  const filtered = filterOccurrences(all, value);
  if (!all.length && value !== state.selectedDate) return "";
  return `<div class="section-head">
      <div><h2>${value === todayString() ? t("common.today") : capitalize(day.toLocaleDateString(locale(), { weekday: "long" }))}</h2><span class="task-count">${formatShortDate(day)}</span></div>
      ${value === state.selectedDate ? renderFilters() : ""}
    </div>
    <div class="task-list" data-drop-date="${value}">${filtered.length ? filtered.map((item) => renderTaskCard({ ...item, occurrenceDate: value })).join("") : renderEmpty(t("empty.free"), t("empty.drag"))}</div>`;
}

function renderMonthDay(day, selected) {
  const value = dateString(day);
  const count = occurrencesForDate(value).length;
  const dots = Math.min(count, 3);
  return `<button class="month-day ${day.getMonth() !== selected.getMonth() ? "other" : ""} ${sameDay(day, selected) ? "selected" : ""} ${value === todayString() ? "today" : ""}" data-date="${escapeHtml(value)}"
    aria-label="${escapeHtml(dayButtonLabel(day, count))}" aria-pressed="${sameDay(day, selected)}"${value === todayString() ? ' aria-current="date"' : ""}>
    ${day.getDate()}${dots ? `<span class="calendar-dots" aria-hidden="true">${"<i></i>".repeat(dots)}</span>` : ""}
  </button>`;
}

function renderTaskCard(item) {
  const task = item.task;
  const occurrenceDate = item.occurrenceDate || task.date;
  const completed = isOccurrenceComplete(task, occurrenceDate);
  const archived = Boolean(task.archivedAt);
  const overdue = !archived && !completed && occurrenceDate < todayString();
  const unresolved = archived ? [] : unresolvedDependencies(task, occurrenceDate);
  const time = task.time ? `${task.time}${state.language === "de" ? ` ${t("common.at")}` : ""}` : t("common.allDay");
  const category = getCategory(task.category);
  const repeat = task.repeat !== "none" ? `<span class="meta-dot"></span><span class="repeat-icon">${t("task.repeatMeta", { value: t(`repeat.${task.repeat}`) })}</span>` : "";
  const dateMeta = state.search || overdue || archived ? `<span class="meta-dot"></span><span class="${overdue ? "overdue-label" : ""}">${overdue ? `${t("task.overdue")} · ` : ""}${formatShortDate(parseDate(occurrenceDate))}</span>` : "";
  const subtaskDone = (task.subtasks || []).filter((subtask) => subtask.completed).length;
  const subtaskMeta = task.subtasks?.length ? `<span class="meta-dot"></span><span class="subtask-progress">${t("task.steps", { done: subtaskDone, total: task.subtasks.length })}</span>` : "";
  const blockedMeta = unresolved.length ? `<span class="meta-dot"></span><span class="blocked-label">${t("task.blocked", { count: unresolved.length })}</span>` : "";
  return `<article class="task-card priority-${task.priority} ${completed ? "completed" : ""} ${overdue ? "overdue" : ""} ${unresolved.length ? "blocked" : ""} ${archived ? "archived" : ""}" draggable="${archived ? "false" : "true"}" data-task-id="${escapeHtml(task.id)}" data-occurrence-date="${escapeHtml(occurrenceDate)}">
    <button class="check-button" aria-label="${completed ? t("common.open") : t("common.done")}"><svg viewBox="0 0 24 24"><path d="m6 12 4 4 8-9"/></svg></button>
    <button class="task-body">
      <span class="task-title">${escapeHtml(task.title)}</span>
      <span class="task-meta"><span>${escapeHtml(time)}</span><span class="meta-dot"></span><i class="category-swatch" style="--category-color:${validColor(category?.color) ? category.color : "#4f8b69"}"></i><span class="category-tag">${escapeHtml(categoryLabel(category))}</span>${repeat}${subtaskMeta}${blockedMeta}${dateMeta}</span>
    </button>
    <div class="card-actions">${archived ? `<button class="postpone-btn" data-restore="${escapeHtml(task.id)}">${t("common.restore")}</button>` : overdue ? `<button class="postpone-btn" data-postpone="${escapeHtml(task.id)}" title="${escapeHtml(t("quick.tomorrow"))}">${t("quick.tomorrow")}</button>` : ""}<button class="more-button" aria-label="${t("task.edit")}"><svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg></button></div>
  </article>`;
}

function renderEmpty(title, text) {
  return `<div class="empty-state"><span class="empty-icon"><svg viewBox="0 0 24 24"><path d="M7 3v3m10-3v3M4.5 9h15M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"/><path d="m8.5 14 2 2 4.5-5"/></svg></span><strong>${escapeHtml(title)}</strong><p>${escapeHtml(text)}</p></div>`;
}

function bindDynamicEvents() {
  elements.main.querySelectorAll("[data-date]").forEach((button) => {
    button.addEventListener("click", () => {
      if (draggedTaskId) return;
      state.selectedDate = button.dataset.date;
      render();
    });
    makeDateDropTarget(button, button.dataset.date);
  });
  elements.main.querySelectorAll("[data-drop-date]").forEach((list) => makeDateDropTarget(list, list.dataset.dropDate));
  elements.main.querySelectorAll("[data-nav]").forEach((button) => button.addEventListener("click", () => navigateDate(button.dataset.nav)));
  elements.main.querySelectorAll("[data-filter]").forEach((button) => button.addEventListener("click", () => {
    state.filter = button.dataset.filter;
    render();
  }));
  elements.main.querySelectorAll(".task-card").forEach((card) => {
    const task = state.tasks.find((item) => item.id === card.dataset.taskId);
    if (!task?.archivedAt) card.querySelector(".check-button").addEventListener("click", () => toggleTask(card.dataset.taskId, card.dataset.occurrenceDate));
    card.querySelector(".task-body").addEventListener("click", () => openTaskSheet(card.dataset.taskId));
    card.querySelector(".more-button").addEventListener("click", () => openTaskSheet(card.dataset.taskId));
    card.querySelector("[data-postpone]")?.addEventListener("click", () => postponeTask(card.dataset.taskId));
    card.querySelector("[data-restore]")?.addEventListener("click", () => restoreTaskById(card.dataset.taskId));
    if (task?.archivedAt) return;
    card.addEventListener("dragstart", (event) => {
      draggedTaskId = card.dataset.taskId;
      card.classList.add("dragging");
      elements.trashDropZone.hidden = false;
      elements.addButton.hidden = true;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", draggedTaskId);
    });
    card.addEventListener("dragend", () => {
      card.classList.remove("dragging");
      clearDragState();
    });
    card.addEventListener("dragover", (event) => {
      if (!draggedTaskId || draggedTaskId === card.dataset.taskId) return;
      event.preventDefault();
      event.stopPropagation();
      card.classList.add("drag-over");
    });
    card.addEventListener("dragleave", () => card.classList.remove("drag-over"));
    card.addEventListener("drop", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      card.classList.remove("drag-over");
      if (draggedTaskId && draggedTaskId !== card.dataset.taskId) await reorderTask(draggedTaskId, card.dataset.taskId, card.dataset.occurrenceDate);
      clearDragState();
    });
  });
}

function makeDateDropTarget(element, date) {
  element.addEventListener("dragover", (event) => {
    if (!draggedTaskId) return;
    event.preventDefault();
    element.classList.add("drag-over");
  });
  element.addEventListener("dragleave", () => element.classList.remove("drag-over"));
  element.addEventListener("drop", async (event) => {
    event.preventDefault();
    element.classList.remove("drag-over");
    if (draggedTaskId) await rescheduleTask(draggedTaskId, date);
    clearDragState();
  });
}

function clearDragState() {
  draggedTaskId = "";
  elements.trashDropZone.hidden = true;
  elements.trashDropZone.classList.remove("active");
  elements.trashDropZone.querySelector("span").textContent = t("drag.delete");
  elements.addButton.hidden = false;
  document.querySelectorAll(".drag-over").forEach((item) => item.classList.remove("drag-over"));
}

async function rescheduleTask(id, date) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;
  task.date = date;
  task.updatedAt = Date.now();
  task.completed = false;
  task.completedAt = null;
  await persist();
  state.selectedDate = date;
  render();
  showToast(t("toast.moved", { date: formatLongDate(parseDate(date)) }));
}

async function reorderTask(sourceId, targetId, targetDate) {
  const source = state.tasks.find((task) => task.id === sourceId);
  const target = state.tasks.find((task) => task.id === targetId);
  if (!source || !target) return;
  if (source.date !== targetDate) {
    source.completed = false;
    source.completedAt = null;
  }
  source.date = targetDate;
  const sameDayTasks = state.tasks.filter((task) => task.date === targetDate && task.repeat === "none").sort(sortTasks);
  const ordered = sameDayTasks.filter((task) => task.id !== sourceId);
  const targetIndex = Math.max(0, ordered.findIndex((task) => task.id === targetId));
  ordered.splice(targetIndex, 0, source);
  ordered.forEach((task, index) => { task.manualOrder = index; task.updatedAt = Date.now(); });
  await persist();
  render();
  showToast(t("toast.reordered"));
}

function navigateDate(direction) {
  if (direction === "today") return jumpToToday();
  const date = parseDate(state.selectedDate);
  const amount = direction === "prev" ? -1 : 1;
  if (state.view === "month") date.setMonth(date.getMonth() + amount, 1);
  else if (state.view === "week") date.setDate(date.getDate() + amount * 7);
  else date.setDate(date.getDate() + amount);
  state.selectedDate = dateString(date);
  render();
}

function jumpToToday() {
  state.selectedDate = todayString();
  render();
}

function openTaskSheet(id = "") {
  const task = state.tasks.find((item) => item.id === id);
  elements.taskForm.reset();
  populateCategorySelect(task?.category);
  elements.taskId.value = task?.id || "";
  elements.taskTitle.value = task?.title || "";
  elements.taskDate.value = task?.date || state.selectedDate;
  elements.taskTime.value = task?.time || "";
  elements.taskCategory.value = task?.category || state.categories[0]?.id || "other";
  elements.taskRepeat.value = task?.repeat || "none";
  elements.taskReminder.value = task?.reminder ?? "none";
  elements.taskNotes.value = task?.notes || "";
  elements.subtaskList.innerHTML = "";
  (task?.subtasks || []).forEach(addSubtaskRow);
  dependencySelection = new Set(task?.dependencyIds || []);
  elements.dependencySearch.value = "";
  renderDependencyOptions(task);
  const priority = task?.priority || "medium";
  elements.taskForm.querySelector(`[name="priority"][value="${priority}"]`).checked = true;
  elements.sheetTitle.textContent = task ? t("task.edit") : t("task.new");
  elements.deleteTask.hidden = !task;
  elements.archiveTask.hidden = !task || Boolean(task.archivedAt);
  elements.restoreTask.hidden = !task?.archivedAt;
  elements.deleteTask.textContent = t("task.delete");
  delete elements.deleteTask.dataset.confirm;
  elements.smartHint.textContent = t("task.smartHint");
  elements.smartHint.classList.remove("detected");
  openDialog(elements.taskSheet, elements.taskBackdrop, elements.taskTitle);
}

function renderDependencyOptions(task, query = "") {
  const needle = query.trim().toLocaleLowerCase(locale());
  const choices = state.tasks
    .filter((item) => item.id !== task?.id)
    .filter((item) => dependencySelection.has(item.id) || (!item.archivedAt && item.repeat === "none" && !item.completed))
    .filter((item) => !needle || [item.title, item.notes, categoryLabel(getCategory(item.category))].join(" ").toLocaleLowerCase(locale()).includes(needle))
    .sort((a, b) => Number(dependencySelection.has(b.id)) - Number(dependencySelection.has(a.id)) || a.date.localeCompare(b.date) || sortTasks(a, b));
  const visible = needle ? choices.slice(0, 20) : [
    ...choices.filter((item) => dependencySelection.has(item.id)),
    ...choices.filter((item) => !dependencySelection.has(item.id)).slice(0, 8),
  ];
  elements.dependencySummary.textContent = dependencySelection.size ? t("task.dependenciesSelected", { count: dependencySelection.size }) : "";
  elements.dependencyList.innerHTML = visible.length ? visible.map((item) => {
    const status = item.archivedAt ? t("nav.archive") : item.completed ? t("common.done") : `${formatShortDate(parseDate(item.date))} · ${categoryLabel(getCategory(item.category))}`;
    return `<label class="dependency-option"><input type="checkbox" value="${escapeHtml(item.id)}" ${dependencySelection.has(item.id) ? "checked" : ""}><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(status)}</small></span></label>`;
  }).join("") : `<p class="dependency-empty">${t("task.noDependencies")}</p>`;
  elements.dependencyList.querySelectorAll('input[type="checkbox"]').forEach((input) => input.addEventListener("change", () => {
    input.checked ? dependencySelection.add(input.value) : dependencySelection.delete(input.value);
    elements.dependencySummary.textContent = dependencySelection.size ? t("task.dependenciesSelected", { count: dependencySelection.size }) : "";
  }));
}

function collectDependencyIds() {
  return [...dependencySelection].filter((id) => state.tasks.some((task) => task.id === id));
}

function wouldCreateCycle(taskId, dependencyIds) {
  if (!taskId) return false;
  const graph = new Map(state.tasks.map((task) => [task.id, task.id === taskId ? dependencyIds : task.dependencyIds || []]));
  const visit = (id, path = new Set()) => {
    if (id === taskId && path.size) return true;
    if (path.has(id)) return false;
    const next = new Set(path).add(id);
    return (graph.get(id) || []).some((dependencyId) => visit(dependencyId, next));
  };
  return dependencyIds.some((id) => visit(id));
}

function unresolvedDependencies(task, occurrenceDate) {
  return (task.dependencyIds || []).map((id) => state.tasks.find((item) => item.id === id)).filter((dependency) => {
    if (!dependency) return false;
    if (dependency.repeat !== "none" && occursOn(dependency, occurrenceDate)) return !isOccurrenceComplete(dependency, occurrenceDate);
    return !dependency.completed && !(dependency.completionDates || []).length;
  });
}

function closeTaskSheet() {
  closeDialog(elements.taskSheet);
}

function addSubtaskRow(subtask = {}) {
  const row = document.createElement("div");
  row.className = "subtask-row";
  row.dataset.id = subtask.id || crypto.randomUUID();
  row.innerHTML = `<input type="checkbox" aria-label="${escapeHtml(t("common.done"))}" ${subtask.completed ? "checked" : ""}><input type="text" maxlength="120" placeholder="${escapeHtml(t("task.stepPlaceholder"))}" value="${escapeHtml(subtask.title || "")}"><button class="remove-subtask" type="button" aria-label="${escapeHtml(t("aria.removeStep"))}">×</button>`;
  row.querySelector(".remove-subtask").addEventListener("click", () => row.remove());
  elements.subtaskList.append(row);
  if (!subtask.title) row.querySelector('input[type="text"]').focus();
}

function collectSubtasks() {
  return [...elements.subtaskList.querySelectorAll(".subtask-row")].map((row) => ({
    id: row.dataset.id,
    title: row.querySelector('input[type="text"]').value.trim(),
    completed: row.querySelector('input[type="checkbox"]').checked,
  })).filter((item) => item.title);
}

async function saveTaskFromForm(event) {
  event.preventDefault();
  applySmartInput(true);
  const id = elements.taskId.value;
  const existing = state.tasks.find((task) => task.id === id);
  const dependencyIds = collectDependencyIds();
  if (wouldCreateCycle(id, dependencyIds)) return showToast(t("toast.circular"));
  const task = normalizeTask({
    id: id || crypto.randomUUID(),
    title: elements.taskTitle.value.trim(),
    date: elements.taskDate.value,
    time: elements.taskTime.value,
    priority: elements.taskForm.querySelector('[name="priority"]:checked').value,
    category: elements.taskCategory.value,
    repeat: elements.taskRepeat.value,
    reminder: elements.taskReminder.value,
    notes: elements.taskNotes.value.trim(),
    subtasks: collectSubtasks(),
    completed: existing?.date === elements.taskDate.value ? existing?.completed || false : false,
    completedAt: existing?.date === elements.taskDate.value ? existing?.completedAt : null,
    completionDates: existing?.completionDates || [],
    dependencyIds,
    archivedAt: existing?.archivedAt || null,
    createdAt: existing?.createdAt || Date.now(),
    manualOrder: existing?.manualOrder,
    updatedAt: Date.now(),
  });
  if (!task.title || !task.date) return;
  state.tasks = existing ? state.tasks.map((item) => item.id === id ? task : item) : [...state.tasks, task];
  state.selectedDate = task.date;
  await persist();
  closeTaskSheet();
  render();
  showToast(t(existing ? "toast.updated" : "toast.saved"));
}

async function handleDelete() {
  const id = elements.taskId.value;
  if (!id) return;
  if (!elements.deleteTask.dataset.confirm) {
    elements.deleteTask.dataset.confirm = "true";
    elements.deleteTask.textContent = t("task.deleteConfirm");
    setTimeout(() => {
      delete elements.deleteTask.dataset.confirm;
      elements.deleteTask.textContent = t("task.delete");
    }, 2500);
    return;
  }
  closeTaskSheet();
  await deleteTaskWithUndo(id);
}

async function deleteTaskWithUndo(id) {
  const index = state.tasks.findIndex((task) => task.id === id);
  if (index < 0) return;
  const task = state.tasks[index];
  const dependentSnapshots = state.tasks
    .filter((item) => (item.dependencyIds || []).includes(id))
    .map((item) => ({ id: item.id, dependencyIds: [...item.dependencyIds] }));
  lastDeletedTask = { task, index, dependentSnapshots };
  state.deletions = { ...state.deletions, [id]: Date.now() };
  state.tasks.splice(index, 1);
  state.tasks.forEach((item) => {
    if (!(item.dependencyIds || []).includes(id)) return;
    item.dependencyIds = item.dependencyIds.filter((dependencyId) => dependencyId !== id);
    item.updatedAt = Date.now();
  });
  await persist();
  render();
  showToast(t("toast.deleted"), { actionLabel: t("action.undo"), action: undoLastDelete, duration: 5000 });
}

async function undoLastDelete() {
  if (!lastDeletedTask || state.tasks.some((task) => task.id === lastDeletedTask.task.id)) return;
  const snapshot = lastDeletedTask;
  lastDeletedTask = null;
  delete state.deletions[snapshot.task.id];
  // Beat any tombstone another device may already have synced for this task.
  snapshot.task.updatedAt = Date.now();
  state.tasks.splice(Math.min(snapshot.index, state.tasks.length), 0, snapshot.task);
  snapshot.dependentSnapshots.forEach((dependent) => {
    const task = state.tasks.find((item) => item.id === dependent.id);
    if (task) task.dependencyIds = dependent.dependencyIds;
  });
  await persist();
  render();
  showToast(t("toast.deleteUndone"));
}

async function archiveCurrentTask() {
  await archiveTaskById(elements.taskId.value);
  closeTaskSheet();
}

async function restoreCurrentTask() {
  await restoreTaskById(elements.taskId.value);
  closeTaskSheet();
}

async function archiveTaskById(id) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;
  task.archivedAt = Date.now();
  task.updatedAt = Date.now();
  await persist();
  render();
  showToast(t("toast.archived"));
}

async function restoreTaskById(id) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;
  task.archivedAt = null;
  task.updatedAt = Date.now();
  await persist();
  render();
  showToast(t("toast.restored"));
}

async function toggleTask(id, occurrenceDate) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;
  if (!isOccurrenceComplete(task, occurrenceDate)) {
    const unresolved = unresolvedDependencies(task, occurrenceDate);
    if (unresolved.length) return showToast(t("toast.blocked", { tasks: unresolved.map((item) => item.title).join(", ") }));
  }
  if (task.repeat !== "none") {
    const dates = new Set(task.completionDates || []);
    dates.has(occurrenceDate) ? dates.delete(occurrenceDate) : dates.add(occurrenceDate);
    task.completionDates = [...dates];
  } else {
    task.completed = !task.completed;
    task.completedAt = task.completed ? Date.now() : null;
  }
  task.updatedAt = Date.now();
  await persist();
  render();
  showToast(t(isOccurrenceComplete(task, occurrenceDate) ? "toast.done" : "toast.openAgain"));
}

async function postponeTask(id) {
  await rescheduleTask(id, dateString(addDays(parseDate(todayString()), 1)));
}

function applyQuickDate(action) {
  const current = elements.taskDate.value ? parseDate(elements.taskDate.value) : parseDate(todayString());
  if (action === "today") elements.taskDate.value = todayString();
  if (action === "tomorrow") elements.taskDate.value = dateString(addDays(parseDate(todayString()), 1));
  if (action === "next-week") elements.taskDate.value = dateString(addDays(parseDate(todayString()), 7));
  if (action === "plus-one") elements.taskDate.value = dateString(addDays(current, 1));
}

function updateSmartHint() {
  const detected = detectSmartTokens(elements.taskTitle.value);
  elements.smartHint.classList.toggle("detected", detected.length > 0);
  elements.smartHint.textContent = detected.length ? t("smart.detected", { items: detected.join(" · ") }) : t("task.smartHint");
}

function detectSmartTokens(value) {
  const found = [];
  if (/\b(heute|morgen|übermorgen|today|tomorrow|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(value)) found.push(t("smart.date"));
  if (/\b([01]?\d|2[0-3]):[0-5]\d\b/.test(value)) found.push(t("smart.time"));
  if (/#[\p{L}\d_-]+/u.test(value)) found.push(t("smart.category"));
  if (/!(hoch|mittel|niedrig|high|medium|low)\b/i.test(value)) found.push(t("smart.priority"));
  if (/@(täglich|taeglich|wöchentlich|woechentlich|monatlich|daily|weekly|monthly)\b/i.test(value)) found.push(t("smart.repeat"));
  return found;
}

function applySmartInput(force) {
  const original = elements.taskTitle.value.trim();
  if (!original || (!force && !detectSmartTokens(original).length)) return;
  let clean = original;
  const lower = original.toLocaleLowerCase(locale());
  const base = parseDate(todayString());
  const relative = { heute: 0, today: 0, morgen: 1, tomorrow: 1, übermorgen: 2 };
  for (const [word, days] of Object.entries(relative)) {
    if (new RegExp(`\\b${word}\\b`, "i").test(lower)) {
      elements.taskDate.value = dateString(addDays(base, days));
      clean = clean.replace(new RegExp(`\\b${word}\\b`, "i"), "");
      break;
    }
  }
  const weekdays = [["sonntag", "sunday"], ["montag", "monday"], ["dienstag", "tuesday"], ["mittwoch", "wednesday"], ["donnerstag", "thursday"], ["freitag", "friday"], ["samstag", "saturday"]];
  const weekdayIndex = weekdays.findIndex((names) => names.some((day) => new RegExp(`\\b${day}\\b`, "i").test(lower)));
  if (weekdayIndex >= 0) {
    let difference = (weekdayIndex - base.getDay() + 7) % 7;
    if (difference === 0) difference = 7;
    elements.taskDate.value = dateString(addDays(base, difference));
    weekdays[weekdayIndex].forEach((day) => { clean = clean.replace(new RegExp(`\\b${day}\\b`, "i"), ""); });
  }
  const time = original.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (time) {
    elements.taskTime.value = `${time[1].padStart(2, "0")}:${time[2]}`;
    clean = clean.replace(time[0], "");
  }
  const priority = original.match(/!(hoch|mittel|niedrig|high|medium|low)\b/i);
  if (priority) {
    const map = { hoch: "high", high: "high", mittel: "medium", medium: "medium", niedrig: "low", low: "low" };
    elements.taskForm.querySelector(`[name="priority"][value="${map[priority[1].toLocaleLowerCase(locale())]}"]`).checked = true;
    clean = clean.replace(priority[0], "");
  }
  const repeat = original.match(/@(täglich|taeglich|wöchentlich|woechentlich|monatlich|daily|weekly|monthly)\b/i);
  if (repeat) {
    const token = repeat[1].toLocaleLowerCase("de");
    elements.taskRepeat.value = token.includes("monat") || token === "monthly" ? "monthly" : token.includes("wöch") || token.includes("woech") || token === "weekly" ? "weekly" : "daily";
    clean = clean.replace(repeat[0], "");
  }
  const categoryToken = original.match(/#([\p{L}\d_-]+)/u);
  if (categoryToken) {
    const name = categoryToken[1].replace(/_/g, " ").toLocaleLowerCase("de");
    const category = state.categories.find((item) => item.label.toLocaleLowerCase("de") === name || item.id.toLocaleLowerCase("de") === name);
    if (category) elements.taskCategory.value = category.id;
    clean = clean.replace(categoryToken[0], "");
  }
  clean = clean.replace(/\s{2,}/g, " ").replace(/\s+([,.;!?])/g, "$1").trim();
  if (clean) elements.taskTitle.value = clean;
  updateSmartHint();
}

function filterOccurrences(items, date) {
  return items.filter((item) => {
    const complete = isOccurrenceComplete(item.task, item.occurrenceDate || date);
    return state.filter === "all" || (state.filter === "done" ? complete : !complete);
  }).sort((a, b) => sortTasks(a.task, b.task));
}

function occurrencesForDate(value) {
  return state.tasks.filter((task) => !task.archivedAt && occursOn(task, value)).map((task) => ({ task, occurrenceDate: value })).sort((a, b) => sortTasks(a.task, b.task));
}

function overdueOccurrences() {
  return state.tasks.filter((task) => !task.archivedAt).flatMap((task) => {
    if (task.repeat === "none") return !task.completed && task.date < todayString() ? [{ task, occurrenceDate: task.date }] : [];
    const previous = latestOccurrenceBefore(task, todayString());
    return previous && !isOccurrenceComplete(task, previous) ? [{ task, occurrenceDate: previous }] : [];
  }).sort((a, b) => a.occurrenceDate.localeCompare(b.occurrenceDate));
}

function latestOccurrenceBefore(task, before) {
  const cursor = addDays(parseDate(before), -1);
  const limit = task.repeat === "monthly" ? 45 : task.repeat === "weekly" ? 8 : 2;
  for (let index = 0; index < limit; index += 1) {
    const value = dateString(addDays(cursor, -index));
    if (occursOn(task, value)) return value;
  }
  return "";
}

function sortTasks(a, b) {
  if (Number.isFinite(a.manualOrder) && Number.isFinite(b.manualOrder) && a.manualOrder !== b.manualOrder) return a.manualOrder - b.manualOrder;
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  if (a.time && b.time && a.time !== b.time) return a.time.localeCompare(b.time);
  if (a.time && !b.time) return -1;
  if (!a.time && b.time) return 1;
  return (priorityOrder[a.priority] ?? 1) - (priorityOrder[b.priority] ?? 1) || a.createdAt - b.createdAt;
}

function openSearch() {
  elements.searchPanel.hidden = false;
  requestAnimationFrame(() => elements.searchInput.focus());
}

function closeSearch() {
  elements.searchPanel.hidden = true;
  elements.searchInput.value = "";
  state.search = "";
  render();
}

function openFullTab() {
  const page = "sidepanel.html?mode=tab";
  if (globalThis.chrome?.tabs?.create && chrome.runtime?.getURL) chrome.tabs.create({ url: chrome.runtime.getURL(page) });
  else window.open(page, "_blank", "noopener");
}

async function captureCurrentTab() {
  try {
    if (!globalThis.chrome?.tabs?.query) throw new Error("tabs unavailable");
    const tabs = await chrome.tabs.query({ lastFocusedWindow: true });
    const extensionRoot = chrome.runtime?.getURL?.("") || "";
    const candidates = tabs.filter((tab) => tab.url && !tab.url.startsWith(extensionRoot) && !/^(chrome|edge|about|view-source):/i.test(tab.url));
    const tab = candidates.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0];
    if (!tab) return showToast(t("toast.noTab"));
    const task = normalizeTask({
      id: crypto.randomUUID(), title: tab.title || tab.url, date: todayString(), category: state.categories[0]?.id || "other",
      notes: tab.url, sourceUrl: tab.url, priority: "medium", repeat: "none", reminder: "none", createdAt: Date.now(), updatedAt: Date.now(),
    });
    state.tasks.push(task);
    state.selectedDate = task.date;
    state.view = "day";
    elements.tabs.forEach((item) => item.classList.toggle("active", item.dataset.view === "day"));
    await persist();
    render();
    showToast(t("toast.tabSaved"));
  } catch {
    showToast(t("toast.noTab"));
  }
}

async function toggleTheme() {
  state.theme = state.theme === "dark" ? "light" : "dark";
  applyTheme();
  await persist();
}

function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
}

function openInfo() {
  elements.languageSelect.value = state.language;
  elements.autoArchiveValue.value = String(state.autoArchiveValue);
  elements.autoArchiveUnit.value = state.autoArchiveUnit;
  renderCategorySettings();
  openDialog(elements.infoSheet, elements.infoBackdrop, elements.closeInfo);
}

function closeInfo() {
  closeDialog(elements.infoSheet);
}

function populateCategorySelect(selected = elements.taskCategory.value) {
  elements.taskCategory.innerHTML = state.categories.map((category) => `<option value="${escapeHtml(category.id)}">${escapeHtml(categoryLabel(category))}</option>`).join("");
  if (state.categories.some((category) => category.id === selected)) elements.taskCategory.value = selected;
}

function renderCategorySettings() {
  elements.categoryList.innerHTML = state.categories.map((category) => `<div class="category-setting" data-category-id="${escapeHtml(category.id)}">
    <input type="color" value="${validColor(category.color) ? category.color : "#4f8b69"}" aria-label="${escapeHtml(t("aria.categoryColor", { name: categoryLabel(category) }))}">
    <input type="text" value="${escapeHtml(categoryLabel(category))}" maxlength="32" aria-label="${escapeHtml(t("aria.categoryName"))}">
    <button type="button" aria-label="${escapeHtml(t("aria.deleteCategory"))}">×</button>
  </div>`).join("");
  elements.categoryList.querySelectorAll(".category-setting").forEach((row) => {
    const id = row.dataset.categoryId;
    row.querySelector('input[type="color"]').addEventListener("change", async (event) => {
      getCategory(id).color = event.target.value;
      await persist();
      render();
    });
    row.querySelector('input[type="text"]').addEventListener("change", async (event) => {
      const category = getCategory(id);
      const label = event.target.value.trim() || t("category.fallback");
      category.label = label;
      // Keep translating the built-in names until the user actually renames one.
      if (label !== t(`category.${id}`)) category.isDefault = false;
      populateCategorySelect();
      await persist();
      render();
    });
    row.querySelector("button").addEventListener("click", () => deleteCategory(id));
  });
}

async function addCategory() {
  const category = { id: crypto.randomUUID(), label: `${t("category.fallback")} ${state.categories.length + 1}`, color: "#4f8b69", isDefault: false };
  state.categories.push(category);
  populateCategorySelect(category.id);
  renderCategorySettings();
  await persist();
}

async function deleteCategory(id) {
  if (state.categories.length === 1) return showToast(t("toast.categoryMin"));
  const fallback = state.categories.find((category) => category.id !== id);
  state.categories = state.categories.filter((category) => category.id !== id);
  state.tasks.forEach((task) => {
    if (task.category !== id) return;
    task.category = fallback.id;
    task.updatedAt = Date.now();
  });
  populateCategorySelect(fallback.id);
  renderCategorySettings();
  await persist();
  render();
  showToast(t("toast.categoryRemoved"));
}

function getCategory(id) {
  return state.categories.find((category) => category.id === id) || state.categories[0];
}

function autoArchiveTasks() {
  const delay = autoArchiveDelayMs(state);
  if (!delay) return false;
  const cutoff = Date.now() - delay;
  let changed = false;
  state.tasks.forEach((task) => {
    if (!task.archivedAt && task.repeat === "none" && task.completed && Number(task.completedAt) && task.completedAt <= cutoff) {
      task.archivedAt = Date.now();
      task.updatedAt = Date.now();
      changed = true;
    }
  });
  return changed;
}

function exportBackup() {
  const backup = { version: 3, exportedAt: new Date().toISOString(), tasks: state.tasks, categories: state.categories, deletions: state.deletions, theme: state.theme, language: state.language, autoArchiveValue: state.autoArchiveValue, autoArchiveUnit: state.autoArchiveUnit };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `planbar-backup-${todayString()}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast(t("toast.exported"));
}

async function importBackup(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  try {
    const imported = JSON.parse(await file.text());
    if (!Array.isArray(imported.tasks)) throw new Error("invalid");
    const restored = mergeTaskLists(state.tasks, imported.tasks);
    // An explicit restore outranks tombstones for the tasks it contains.
    for (const task of imported.tasks) delete state.deletions[safeId(task?.id)];
    state.tasks = applyDeletions(restored, state.deletions);
    if (["de", "en"].includes(imported.language)) state.language = imported.language;
    if (Array.isArray(imported.categories) && imported.categories.length) state.categories = imported.categories.map(normalizeCategory);
    if (imported.autoArchiveValue != null || imported.autoArchiveDays != null) {
      const archiveConfig = autoArchiveConfig(imported);
      state.autoArchiveValue = archiveConfig.value;
      state.autoArchiveUnit = archiveConfig.unit;
    }
    await persist();
    applyLanguage();
    populateCategorySelect();
    renderCategorySettings();
    render();
    showToast(t("toast.imported", { count: imported.tasks.length }));
  } catch {
    showToast(t("toast.importFailed"));
  }
}

function openFocus(taskId = "") {
  const today = todayString();
  const open = state.tasks.filter((task) => !task.archivedAt && !unresolvedDependencies(task, today).length && (task.repeat === "none" ? !task.completed : occursOn(task, today) && !isOccurrenceComplete(task, today))).sort(sortTasks);
  elements.focusTask.innerHTML = open.length
    ? open.map((task) => `<option value="${escapeHtml(task.id)}">${escapeHtml(task.title)}</option>`).join("")
    : `<option value="">${escapeHtml(t("focus.noOpenTask"))}</option>`;
  const preselect = taskId || focusPendingTaskId;
  if (open.some((task) => task.id === preselect)) elements.focusTask.value = preselect;
  focusPendingTaskId = "";
  openDialog(elements.focusSheet, elements.focusBackdrop, elements.startTimer);
  updateTimerDisplay();
}

function closeFocus() {
  closeDialog(elements.focusSheet);
}

function setTimerMode(mode) {
  focusState.running = false;
  clearInterval(focusState.interval);
  focusState.mode = mode;
  focusState.total = mode === "focus" ? 25 * 60 : 5 * 60;
  focusState.remaining = focusState.total;
  focusState.deadline = 0;
  elements.timerTabs.forEach((button) => button.classList.toggle("active", button.dataset.timerMode === mode));
  elements.startTimer.textContent = t("focus.start");
  elements.timerStatus.textContent = t("focus.ready");
  updateTimerDisplay();
  saveFocusSession();
}

function toggleTimer() {
  if (focusState.running) pauseTimer();
  else startTimer();
}

function startTimer(resume = false) {
  if (!resume) {
    if (focusState.remaining <= 0) focusState.remaining = focusState.total;
    focusState.deadline = Date.now() + focusState.remaining * 1000;
  }
  focusState.running = true;
  elements.startTimer.textContent = t("focus.pause");
  elements.timerStatus.textContent = t(focusState.mode === "focus" ? "focus.working" : "focus.breathe");
  clearInterval(focusState.interval);
  focusState.interval = setInterval(tickTimer, 250);
  if (!resume) saveFocusSession();
}

function pauseTimer() {
  if (focusState.running) focusState.remaining = Math.max(0, Math.ceil((focusState.deadline - Date.now()) / 1000));
  focusState.running = false;
  clearInterval(focusState.interval);
  elements.startTimer.textContent = t("focus.resume");
  elements.timerStatus.textContent = t("focus.paused");
  updateTimerDisplay();
  saveFocusSession();
}

function resetTimer() {
  focusState.running = false;
  clearInterval(focusState.interval);
  focusState.remaining = focusState.total;
  focusState.deadline = 0;
  elements.startTimer.textContent = t("focus.start");
  elements.timerStatus.textContent = t("focus.ready");
  updateTimerDisplay();
  saveFocusSession();
}

function tickTimer() {
  focusState.remaining = Math.max(0, Math.ceil((focusState.deadline - Date.now()) / 1000));
  updateTimerDisplay();
  if (focusState.remaining > 0) return;
  focusState.running = false;
  clearInterval(focusState.interval);
  elements.startTimer.textContent = t("focus.again");
  elements.timerStatus.textContent = t("focus.done");
  // The service worker owns the notification so a closed side panel still reports the round.
  showToast(focusMessage());
}

function focusMessage() {
  const task = state.tasks.find((item) => item.id === elements.focusTask.value);
  if (focusState.mode !== "focus") return t("focus.breakDone");
  return task ? t("focus.roundDoneTask", { title: task.title }) : t("focus.roundDone");
}

// The side panel unloads when it closes, so the session lives in storage and finishes on an alarm.
async function saveFocusSession() {
  if (!globalThis.chrome?.storage?.local) return;
  await chrome.storage.local.set({
    [FOCUS_KEY]: {
      mode: focusState.mode,
      total: focusState.total,
      remaining: focusState.remaining,
      running: focusState.running,
      deadline: focusState.deadline,
      taskId: elements.focusTask.value || "",
    },
  });
  if (!globalThis.chrome.alarms) return;
  if (focusState.running && focusState.deadline > Date.now()) await chrome.alarms.create(FOCUS_ALARM, { when: focusState.deadline });
  else await chrome.alarms.clear(FOCUS_ALARM);
}

async function restoreFocusSession() {
  if (!globalThis.chrome?.storage?.local) return;
  const stored = (await chrome.storage.local.get(FOCUS_KEY))[FOCUS_KEY];
  if (!stored) return;
  focusState.mode = stored.mode === "break" ? "break" : "focus";
  focusState.total = Number(stored.total) || (focusState.mode === "focus" ? 25 * 60 : 5 * 60);
  focusState.deadline = Number(stored.deadline) || 0;
  focusPendingTaskId = safeId(stored.taskId);
  elements.timerTabs.forEach((button) => button.classList.toggle("active", button.dataset.timerMode === focusState.mode));
  if (stored.running && focusState.deadline > Date.now()) {
    focusState.remaining = Math.ceil((focusState.deadline - Date.now()) / 1000);
    startTimer(true);
    return;
  }
  if (stored.running) {
    focusState.remaining = 0;
    elements.startTimer.textContent = t("focus.again");
    elements.timerStatus.textContent = t("focus.done");
  } else {
    focusState.remaining = Number(stored.remaining) || focusState.total;
  }
  updateTimerDisplay();
}

function updateTimerDisplay() {
  const minutes = Math.floor(focusState.remaining / 60);
  const seconds = focusState.remaining % 60;
  elements.timerDisplay.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  elements.timerRing.style.setProperty("--timer-progress", `${focusState.total ? (focusState.remaining / focusState.total) * 360 : 0}deg`);
}

function showToast(message, options = {}) {
  clearTimeout(toastTimer);
  if (options.action && options.actionLabel) {
    elements.toast.textContent = "";
    const label = document.createElement("span");
    label.textContent = message;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = options.actionLabel;
    button.addEventListener("click", async () => {
      clearTimeout(toastTimer);
      elements.toast.classList.remove("show");
      await options.action();
    });
    elements.toast.append(label, button);
  } else {
    elements.toast.textContent = message;
  }
  elements.toast.classList.add("show");
  toastTimer = setTimeout(() => elements.toast.classList.remove("show"), options.duration || 2200);
}

async function loadData() {
  try {
    if (!globalThis.chrome?.storage?.local) return snapshotOf(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"));
    const localResult = await chrome.storage.local.get(STORAGE_KEY);
    const localData = localResult[STORAGE_KEY] || {};
    try {
      const sync = await chrome.storage.sync.get(null);
      const meta = sync[SYNC_META_KEY];
      if (!meta) return snapshotOf(localData);
      const syncTasks = Object.entries(sync).filter(([key]) => key.startsWith(SYNC_TASK_PREFIX)).map(([, task]) => task);
      // Sync is a peer, not the authority: a partial or lagging sync store must never drop local tasks.
      const remoteIsNewer = (Number(meta.updatedAt) || 0) > (Number(localData.updatedAt) || 0);
      const base = remoteIsNewer ? { ...localData, ...meta } : { ...meta, ...localData };
      return snapshotOf({ ...base, version: 3, tasks: mergeTaskLists(localData.tasks, syncTasks), deletions: mergeDeletions(localData.deletions, meta.deletions) });
    } catch {
      return snapshotOf(localData);
    }
  } catch {
    return snapshotOf({});
  }
}

function snapshotOf(saved) {
  const deletions = pruneDeletions(saved.deletions);
  return { ...saved, deletions, tasks: applyDeletions(mergeTaskLists(saved.tasks), deletions) };
}

async function persist() {
  if (globalThis.chrome?.storage?.local) {
    const stored = (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY];
    // Another context may have written since we last saw storage — fold that in rather than overwrite it.
    if (stored && (Number(stored.updatedAt) || 0) !== lastWriteStamp) applySnapshot(mergeIntoState(stored));
  }
  state.deletions = pruneDeletions(state.deletions);
  lastWriteStamp = Date.now();
  const value = {
    version: 3,
    tasks: state.tasks,
    categories: state.categories,
    deletions: state.deletions,
    theme: state.theme,
    language: state.language,
    autoArchiveValue: state.autoArchiveValue,
    autoArchiveUnit: state.autoArchiveUnit,
    updatedAt: lastWriteStamp,
  };
  if (!globalThis.chrome?.storage?.local) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    return;
  }
  await chrome.storage.local.set({ [STORAGE_KEY]: value });
  try {
    const sync = await chrome.storage.sync.get(null);
    const taskEntries = Object.fromEntries(tasksForSync().map((task) => [`${SYNC_TASK_PREFIX}${task.id}`, task]));
    // Write first, prune second: a failed write then leaves the previous sync payload intact.
    await chrome.storage.sync.set({
      [SYNC_META_KEY]: { version: 3, categories: state.categories, deletions: state.deletions, theme: state.theme, language: state.language, autoArchiveValue: state.autoArchiveValue, autoArchiveUnit: state.autoArchiveUnit, updatedAt: value.updatedAt },
      ...taskEntries,
    });
    const staleKeys = Object.keys(sync).filter((key) => key.startsWith(SYNC_TASK_PREFIX) && !taskEntries[key]);
    if (staleKeys.length) await chrome.storage.sync.remove(staleKeys);
  } catch (error) {
    console.warn("Planbar: Chrome Sync unavailable, data was saved locally.", error);
    warnSyncLimit();
  }
}

function tasksForSync() {
  if (state.tasks.length <= SYNC_TASK_LIMIT) return state.tasks;
  warnSyncLimit();
  const active = state.tasks.filter((task) => !task.archivedAt);
  if (active.length <= SYNC_TASK_LIMIT) return active;
  return [...active].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, SYNC_TASK_LIMIT);
}

function warnSyncLimit() {
  if (syncLimitWarned) return;
  syncLimitWarned = true;
  showToast(t("toast.syncPaused"));
}

function sameDay(a, b) { return dateString(a) === dateString(b); }
function formatLongDate(date) { return capitalize(date.toLocaleDateString(locale(), { weekday: "long", day: "numeric", month: "long" })); }
function formatShortDate(date) { return date.toLocaleDateString(locale(), { day: "2-digit", month: "2-digit" }); }
function formatAgendaTitle(date) { return dateString(date) === todayString() ? t("common.today") : capitalize(date.toLocaleDateString(locale(), { weekday: "long", day: "numeric", month: "long" })); }
function getWeekNumber(date) {
  const value = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  value.setUTCDate(value.getUTCDate() + 4 - (value.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(value.getUTCFullYear(), 0, 1));
  return Math.ceil((((value - yearStart) / 86400000) + 1) / 7);
}
function relativeDayLabel(date) {
  const difference = Math.round((parseDate(dateString(date)) - parseDate(todayString())) / 86400000);
  if (difference === 0) return { eyebrow: t("hero.todayEyebrow"), title: t("hero.todayTitle") };
  if (difference === 1) return { eyebrow: t("hero.tomorrowEyebrow"), title: t("hero.tomorrowTitle") };
  if (difference === -1) return { eyebrow: t("hero.yesterdayEyebrow"), title: t("hero.yesterdayTitle") };
  return { eyebrow: date.toLocaleDateString(locale(), { weekday: "long" }).toUpperCase(), title: state.language === "en" ? capitalize(date.toLocaleDateString(locale(), { month: "long", day: "numeric" })) : `${date.getDate()}. ${capitalize(date.toLocaleDateString(locale(), { month: "long" }))}` };
}
function daySummary(total, completed) {
  if (!total) return t("hero.free");
  if (total === completed) return t("hero.complete");
  return t(total - completed === 1 ? "hero.waitingOne" : "hero.waitingMany", { count: total - completed });
}
function capitalize(value) { return value.charAt(0).toUpperCase() + value.slice(1); }
function validColor(value) { return /^#[0-9a-f]{6}$/i.test(String(value || "")); }
function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

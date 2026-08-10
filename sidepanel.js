const STORAGE_KEY = "planbarData";
const SYNC_META_KEY = "planbarMeta";
const SYNC_TASK_PREFIX = "planbarTask_";

const DEFAULT_CATEGORIES = [
  { id: "work", label: "Arbeit", color: "#4f8b69" },
  { id: "personal", label: "Privat", color: "#8b6fb0" },
  { id: "health", label: "Gesundheit", color: "#d66f64" },
  { id: "learning", label: "Lernen", color: "#4f83b8" },
  { id: "other", label: "Sonstiges", color: "#9a8c70" },
];

const REPEAT_LABELS = {
  daily: "Täglich",
  weekly: "Wöchentlich",
  monthly: "Monatlich",
};

const state = {
  tasks: [],
  categories: DEFAULT_CATEGORIES.map((item) => ({ ...item })),
  weekGoal: 10,
  view: "day",
  selectedDate: todayString(),
  filter: "open",
  search: "",
  theme: "light",
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
  main: document.querySelector("#mainContent"),
  tabs: [...document.querySelectorAll(".view-tab")],
  addButton: document.querySelector("#addButton"),
  taskSheet: document.querySelector("#taskSheet"),
  taskBackdrop: document.querySelector("#taskBackdrop"),
  taskForm: document.querySelector("#taskForm"),
  sheetTitle: document.querySelector("#sheetTitle"),
  closeSheet: document.querySelector("#closeSheet"),
  deleteTask: document.querySelector("#deleteTask"),
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
  weekGoal: document.querySelector("#weekGoal"),
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
};

let toastTimer;
let draggedTaskId = "";
let draggedOccurrenceDate = "";
let storageReloadTimer;

init();

async function init() {
  const params = new URLSearchParams(location.search);
  if (params.get("mode") === "tab") document.documentElement.dataset.mode = "tab";

  const saved = await loadData();
  applySavedData(saved);
  if (params.get("date")) state.selectedDate = params.get("date");
  applyTheme();
  populateCategorySelect();
  bindStaticEvents();
  bindStorageUpdates();
  render();
  await persist();
  if (params.get("task")) openTaskSheet(params.get("task"));
}

function applySavedData(saved) {
  state.tasks = Array.isArray(saved.tasks) ? saved.tasks.map(normalizeTask) : [];
  state.categories = Array.isArray(saved.categories) && saved.categories.length
    ? saved.categories.map(normalizeCategory)
    : DEFAULT_CATEGORIES.map((item) => ({ ...item }));
  state.weekGoal = clamp(Number(saved.weekGoal) || 10, 1, 100);
  state.theme = saved.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
}

function normalizeTask(task) {
  return {
    ...task,
    id: task.id || crypto.randomUUID(),
    title: String(task.title || "Unbenannte Aufgabe").slice(0, 120),
    date: task.date || todayString(),
    time: task.time || "",
    priority: ["low", "medium", "high"].includes(task.priority) ? task.priority : "medium",
    category: task.category || "other",
    repeat: ["none", "daily", "weekly", "monthly"].includes(task.repeat) ? task.repeat : "none",
    reminder: task.reminder ?? "none",
    notes: task.notes || "",
    subtasks: Array.isArray(task.subtasks) ? task.subtasks.map((item) => ({
      id: item.id || crypto.randomUUID(),
      title: String(item.title || "").slice(0, 120),
      completed: Boolean(item.completed),
    })).filter((item) => item.title) : [],
    completed: Boolean(task.completed),
    completionDates: Array.isArray(task.completionDates) ? task.completionDates : [],
    createdAt: Number(task.createdAt) || Date.now(),
    updatedAt: Number(task.updatedAt) || Date.now(),
  };
}

function normalizeCategory(category) {
  return {
    id: String(category.id || crypto.randomUUID()),
    label: String(category.label || "Bereich").slice(0, 32),
    color: validColor(category.color) ? category.color : "#4f8b69",
  };
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
  elements.closeSheet.addEventListener("click", closeTaskSheet);
  elements.taskBackdrop.addEventListener("click", closeTaskSheet);
  elements.taskForm.addEventListener("submit", saveTaskFromForm);
  elements.deleteTask.addEventListener("click", handleDelete);
  elements.addSubtask.addEventListener("click", () => addSubtaskRow());
  elements.taskTitle.addEventListener("input", updateSmartHint);
  elements.taskTitle.addEventListener("blur", () => applySmartInput(false));
  document.querySelectorAll("[data-quick-date]").forEach((button) => {
    button.addEventListener("click", () => applyQuickDate(button.dataset.quickDate));
  });

  elements.searchButton.addEventListener("click", openSearch);
  elements.focusButton.addEventListener("click", () => openFocus());
  elements.openTabButton.addEventListener("click", openFullTab);
  elements.clearSearch.addEventListener("click", closeSearch);
  elements.searchInput.addEventListener("input", (event) => {
    state.search = event.target.value.trim().toLocaleLowerCase("de");
    render();
  });
  elements.themeButton.addEventListener("click", toggleTheme);
  elements.brandButton.addEventListener("click", jumpToToday);

  elements.settingsButton.addEventListener("click", openInfo);
  elements.closeInfo.addEventListener("click", closeInfo);
  elements.infoBackdrop.addEventListener("click", closeInfo);
  elements.weekGoal.addEventListener("change", async () => {
    state.weekGoal = clamp(Number(elements.weekGoal.value) || 10, 1, 100);
    elements.weekGoal.value = state.weekGoal;
    await persist();
    render();
  });
  elements.addCategory.addEventListener("click", addCategory);
  elements.exportData.addEventListener("click", exportBackup);
  elements.importData.addEventListener("click", () => elements.importFile.click());
  elements.importFile.addEventListener("change", importBackup);

  elements.closeFocus.addEventListener("click", closeFocus);
  elements.focusBackdrop.addEventListener("click", closeFocus);
  elements.startTimer.addEventListener("click", toggleTimer);
  elements.resetTimer.addEventListener("click", resetTimer);
  elements.timerTabs.forEach((button) => button.addEventListener("click", () => setTimerMode(button.dataset.timerMode)));

  document.addEventListener("keydown", (event) => {
    const command = event.metaKey || event.ctrlKey;
    if (command && event.key === "Enter") {
      event.preventDefault();
      openTaskSheet();
    }
    if (command && event.key.toLowerCase() === "k") {
      event.preventDefault();
      openSearch();
    }
    if (event.key === "Escape") {
      closeTaskSheet();
      closeInfo();
      closeFocus();
      if (!elements.searchPanel.hidden) closeSearch();
    }
  });
}

function bindStorageUpdates() {
  if (!globalThis.chrome?.storage?.onChanged) return;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[STORAGE_KEY]?.newValue) {
      const incoming = changes[STORAGE_KEY].newValue;
      const incomingStamp = Math.max(0, ...(incoming.tasks || []).map((task) => Number(task.updatedAt) || 0));
      const currentStamp = Math.max(0, ...state.tasks.map((task) => Number(task.updatedAt) || 0));
      if ((incoming.tasks || []).length !== state.tasks.length || incomingStamp > currentStamp) {
        applySavedData(incoming);
        populateCategorySelect();
        render();
      }
    }
    if (area === "sync" && Object.keys(changes).some((key) => key === SYNC_META_KEY || key.startsWith(SYNC_TASK_PREFIX))) {
      clearTimeout(storageReloadTimer);
      storageReloadTimer = setTimeout(async () => {
        const saved = await loadData();
        applySavedData(saved);
        populateCategorySelect();
        applyTheme();
        render();
      }, 350);
    }
  });
}

function render() {
  if (state.search) return renderSearchResults();
  if (state.view === "week") renderWeekView();
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
        <div class="progress-ring" style="--progress:${percent * 3.6}deg" aria-label="${percent} Prozent erledigt"><span>${percent}%</span></div>
      </div>
      ${renderDateControls(formatLongDate(date))}
    </section>
    ${renderWeekStrip(date)}
    ${overdue.length && state.filter !== "done" ? renderOverdue(overdue) : ""}
    ${all.length ? renderSummaryCard(all, completed, date) : ""}
    ${renderListSection(filtered, all.length, "Aufgaben")}
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
          <p class="eyebrow">KALENDERWOCHE ${weekNumber}</p>
          <h1>Deine Woche</h1>
          <p class="hero-subtitle">${weekItems.length ? `${completed} von ${weekItems.length} Aufgaben erledigt` : "Noch ist diese Woche ganz frei."}</p>
        </div>
        <div class="progress-ring" style="--progress:${percent * 3.6}deg"><span>${percent}%</span></div>
      </div>
      ${renderDateControls(`${formatShortDate(monday)} – ${formatShortDate(days[6])}`)}
    </section>
    ${renderWeekStrip(date)}
    ${renderStats(completed)}
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
          <p class="eyebrow">MONATSPLANUNG</p>
          <h1>${capitalize(first.toLocaleDateString("de-DE", { month: "long" }))}</h1>
          <p class="hero-subtitle">Plane mit Überblick und bleib flexibel.</p>
        </div>
        <div class="summary-number">${first.getFullYear()}</div>
      </div>
      ${renderDateControls(first.toLocaleDateString("de-DE", { month: "long", year: "numeric" }))}
    </section>
    <div class="month-grid" role="grid" aria-label="Monatskalender">
      ${["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((day) => `<div class="month-weekday">${day}</div>`).join("")}
      ${days.map((day) => renderMonthDay(day, selected)).join("")}
    </div>
    ${renderListSection(filtered, selectedItems.length, formatAgendaTitle(selected))}
  `;
  bindDynamicEvents();
}

function renderSearchResults() {
  const results = state.tasks
    .filter((task) => [task.title, task.notes, getCategory(task.category)?.label, ...(task.subtasks || []).map((item) => item.title)].join(" ").toLocaleLowerCase("de").includes(state.search))
    .sort(sortTasks)
    .map((task) => ({ task, occurrenceDate: task.date }));
  elements.main.innerHTML = `
    <section class="hero">
      <p class="eyebrow">SUCHE</p>
      <h1>${results.length} Treffer</h1>
      <p class="hero-subtitle">Ergebnisse für „${escapeHtml(elements.searchInput.value.trim())}“</p>
    </section>
    <div class="task-list">${results.length ? results.map(renderTaskCard).join("") : renderEmpty("Keine Treffer", "Versuche es mit einem anderen Begriff oder Bereich.")}</div>`;
  bindDynamicEvents();
}

function renderDateControls(label) {
  return `<div class="date-controls">
    <button class="nav-btn" data-nav="prev" aria-label="Zurück">‹</button>
    <span class="date-label">${escapeHtml(label)}</span>
    <button class="today-btn" data-nav="today">Heute</button>
    <button class="nav-btn" data-nav="next" aria-label="Weiter">›</button>
  </div>`;
}

function renderWeekStrip(selected) {
  const monday = startOfWeek(selected);
  return `<div class="week-strip" aria-label="Wochentage">${Array.from({ length: 7 }, (_, index) => {
    const day = addDays(monday, index);
    const value = dateString(day);
    const hasTasks = occurrencesForDate(value).length > 0;
    return `<button class="day-pill ${sameDay(day, selected) ? "selected" : ""} ${value === todayString() ? "today" : ""}" data-date="${value}">
      <span class="weekday">${day.toLocaleDateString("de-DE", { weekday: "short" }).replace(".", "")}</span>
      <span class="day-number">${day.getDate()}</span>${hasTasks ? '<span class="day-dot"></span>' : ""}
    </button>`;
  }).join("")}</div>`;
}

function renderSummaryCard(items, completed, date, isWeek = false) {
  const open = items.length - completed;
  const high = items.filter((item) => item.task.priority === "high" && !isOccurrenceComplete(item.task, item.occurrenceDate || dateString(date))).length;
  return `<div class="summary-card">
    <strong>${open ? `${open} ${open === 1 ? "Aufgabe" : "Aufgaben"} offen` : "Alles geschafft!"}</strong>
    <span class="summary-number">${items.length ? Math.round((completed / items.length) * 100) : 0}%</span>
    <p>${high ? `${high} mit hoher Priorität` : isWeek ? "Guter Überblick für die ganze Woche" : "Du bestimmst das Tempo"}</p>
  </div>`;
}

function renderStats(weekCompleted) {
  const goalPercent = Math.min(100, Math.round((weekCompleted / state.weekGoal) * 100));
  return `<div class="stats-grid">
    <div class="stat-card"><strong>${weekCompleted}/${state.weekGoal}</strong><span>Wochenziel</span><div class="goal-track"><i style="width:${goalPercent}%"></i></div></div>
    <div class="stat-card"><strong>${completionRate()}%</strong><span>Erledigungsquote</span></div>
    <div class="stat-card"><strong>${calculateStreak()} 🔥</strong><span>Tage in Folge</span></div>
    <div class="stat-card"><strong>${escapeHtml(bestWeekday())}</strong><span>Stärkster Wochentag</span></div>
  </div>`;
}

function renderOverdue(items) {
  return `<section class="overdue-block">
    <div class="section-head"><div><h2>Überfällig</h2><span class="task-count">${items.length} neu einplanen</span></div></div>
    <div class="task-list">${items.map((item) => renderTaskCard(item)).join("")}</div>
  </section>`;
}

function renderListSection(items, total, title) {
  return `<div class="section-head">
      <div><h2>${escapeHtml(title)}</h2><span class="task-count">${total} insgesamt</span></div>${renderFilters()}
    </div>
    <div class="task-list">${items.length ? items.map(renderTaskCard).join("") : renderEmpty(
      state.filter === "done" ? "Noch nichts erledigt" : state.filter === "all" && total === 0 ? "Freier Tag" : "Alles erledigt",
      state.filter === "done" ? "Abgehakte Aufgaben erscheinen später hier." : total === 0 ? "Genieße den Freiraum oder plane eine neue Aufgabe." : "Stark! Du hast für diesen Zeitraum alles geschafft."
    )}</div>`;
}

function renderFilters() {
  return `<div class="filter-row" aria-label="Aufgaben filtern">
    <button class="filter-chip ${state.filter === "open" ? "active" : ""}" data-filter="open">Offen</button>
    <button class="filter-chip ${state.filter === "all" ? "active" : ""}" data-filter="all">Alle</button>
    <button class="filter-chip ${state.filter === "done" ? "active" : ""}" data-filter="done">Erledigt</button>
  </div>`;
}

function renderDayGroup(day) {
  const value = dateString(day);
  const all = occurrencesForDate(value);
  const filtered = filterOccurrences(all, value);
  if (!all.length && value !== state.selectedDate) return "";
  return `<div class="section-head">
      <div><h2>${value === todayString() ? "Heute" : capitalize(day.toLocaleDateString("de-DE", { weekday: "long" }))}</h2><span class="task-count">${formatShortDate(day)}</span></div>
      ${value === state.selectedDate ? renderFilters() : ""}
    </div>
    <div class="task-list" data-drop-date="${value}">${filtered.length ? filtered.map((item) => renderTaskCard({ ...item, occurrenceDate: value })).join("") : renderEmpty("Freier Tag", "Ziehe eine Aufgabe hierher oder plane eine neue.")}</div>`;
}

function renderMonthDay(day, selected) {
  const value = dateString(day);
  const count = Math.min(occurrencesForDate(value).length, 3);
  return `<button class="month-day ${day.getMonth() !== selected.getMonth() ? "other" : ""} ${sameDay(day, selected) ? "selected" : ""} ${value === todayString() ? "today" : ""}" data-date="${value}" aria-label="${formatLongDate(day)}">
    ${day.getDate()}${count ? `<span class="calendar-dots">${"<i></i>".repeat(count)}</span>` : ""}
  </button>`;
}

function renderTaskCard(item) {
  const task = item.task;
  const occurrenceDate = item.occurrenceDate || task.date;
  const completed = isOccurrenceComplete(task, occurrenceDate);
  const overdue = !completed && occurrenceDate < todayString();
  const time = task.time ? `${task.time} Uhr` : "Ganztägig";
  const category = getCategory(task.category);
  const repeat = task.repeat !== "none" ? `<span class="meta-dot"></span><span class="repeat-icon">↻ ${REPEAT_LABELS[task.repeat]}</span>` : "";
  const dateMeta = state.search || overdue ? `<span class="meta-dot"></span><span class="${overdue ? "overdue-label" : ""}">${overdue ? "Überfällig · " : ""}${formatShortDate(parseDate(occurrenceDate))}</span>` : "";
  const subtaskDone = (task.subtasks || []).filter((subtask) => subtask.completed).length;
  const subtaskMeta = task.subtasks?.length ? `<span class="meta-dot"></span><span class="subtask-progress">${subtaskDone}/${task.subtasks.length} Schritte</span>` : "";
  return `<article class="task-card priority-${task.priority} ${completed ? "completed" : ""} ${overdue ? "overdue" : ""}" draggable="true" data-task-id="${task.id}" data-occurrence-date="${occurrenceDate}">
    <button class="check-button" aria-label="${completed ? "Als offen markieren" : "Aufgabe abhaken"}"><svg viewBox="0 0 24 24"><path d="m6 12 4 4 8-9"/></svg></button>
    <button class="task-body">
      <span class="task-title">${escapeHtml(task.title)}</span>
      <span class="task-meta"><span>${escapeHtml(time)}</span><span class="meta-dot"></span><i class="category-swatch" style="--category-color:${validColor(category?.color) ? category.color : "#4f8b69"}"></i><span class="category-tag">${escapeHtml(category?.label || "Sonstiges")}</span>${repeat}${subtaskMeta}${dateMeta}</span>
    </button>
    <div class="card-actions">${overdue ? `<button class="postpone-btn" data-postpone="${task.id}" title="Auf morgen verschieben">Morgen</button>` : ""}<button class="more-button" aria-label="Aufgabe bearbeiten"><svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg></button></div>
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
    card.querySelector(".check-button").addEventListener("click", () => toggleTask(card.dataset.taskId, card.dataset.occurrenceDate));
    card.querySelector(".task-body").addEventListener("click", () => openTaskSheet(card.dataset.taskId));
    card.querySelector(".more-button").addEventListener("click", () => openTaskSheet(card.dataset.taskId));
    card.querySelector("[data-postpone]")?.addEventListener("click", () => postponeTask(card.dataset.taskId));
    card.addEventListener("dragstart", (event) => {
      draggedTaskId = card.dataset.taskId;
      draggedOccurrenceDate = card.dataset.occurrenceDate;
      card.classList.add("dragging");
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
  draggedOccurrenceDate = "";
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
  showToast(`Auf ${formatLongDate(parseDate(date))} verschoben`);
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
  showToast("Reihenfolge gespeichert");
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
  const priority = task?.priority || "medium";
  elements.taskForm.querySelector(`[name="priority"][value="${priority}"]`).checked = true;
  elements.sheetTitle.textContent = task ? "Aufgabe bearbeiten" : "Neue Aufgabe";
  elements.deleteTask.hidden = !task;
  elements.deleteTask.textContent = "Aufgabe löschen";
  delete elements.deleteTask.dataset.confirm;
  elements.smartHint.textContent = "Tipp: „Bericht morgen 14:30 #Arbeit !hoch @wöchentlich“";
  elements.smartHint.classList.remove("detected");
  elements.taskSheet.hidden = false;
  elements.taskBackdrop.hidden = false;
  requestAnimationFrame(() => elements.taskTitle.focus());
}

function closeTaskSheet() {
  elements.taskSheet.hidden = true;
  elements.taskBackdrop.hidden = true;
}

function addSubtaskRow(subtask = {}) {
  const row = document.createElement("div");
  row.className = "subtask-row";
  row.dataset.id = subtask.id || crypto.randomUUID();
  row.innerHTML = `<input type="checkbox" aria-label="Unteraufgabe erledigt" ${subtask.completed ? "checked" : ""}><input type="text" maxlength="120" placeholder="Nächster kleiner Schritt" value="${escapeHtml(subtask.title || "")}"><button class="remove-subtask" type="button" aria-label="Unteraufgabe entfernen">×</button>`;
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
  showToast(existing ? "Aufgabe aktualisiert" : "Aufgabe eingeplant");
}

async function handleDelete() {
  const id = elements.taskId.value;
  if (!id) return;
  if (!elements.deleteTask.dataset.confirm) {
    elements.deleteTask.dataset.confirm = "true";
    elements.deleteTask.textContent = "Wirklich löschen?";
    setTimeout(() => {
      delete elements.deleteTask.dataset.confirm;
      elements.deleteTask.textContent = "Aufgabe löschen";
    }, 2500);
    return;
  }
  state.tasks = state.tasks.filter((task) => task.id !== id);
  await persist();
  closeTaskSheet();
  render();
  showToast("Aufgabe gelöscht");
}

async function toggleTask(id, occurrenceDate) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;
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
  showToast(isOccurrenceComplete(task, occurrenceDate) ? "Geschafft – gut gemacht!" : "Wieder als offen markiert");
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
  elements.smartHint.textContent = detected.length ? `Erkannt: ${detected.join(" · ")}` : "Tipp: „Bericht morgen 14:30 #Arbeit !hoch @wöchentlich“";
}

function detectSmartTokens(value) {
  const found = [];
  if (/\b(heute|morgen|übermorgen|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\b/i.test(value)) found.push("Datum");
  if (/\b([01]?\d|2[0-3]):[0-5]\d\b/.test(value)) found.push("Uhrzeit");
  if (/#[\p{L}\d_-]+/u.test(value)) found.push("Bereich");
  if (/!(hoch|mittel|niedrig)\b/i.test(value)) found.push("Priorität");
  if (/@(täglich|taeglich|wöchentlich|woechentlich|monatlich)\b/i.test(value)) found.push("Wiederholung");
  return found;
}

function applySmartInput(force) {
  const original = elements.taskTitle.value.trim();
  if (!original || (!force && !detectSmartTokens(original).length)) return;
  let clean = original;
  const lower = original.toLocaleLowerCase("de");
  const base = parseDate(todayString());
  const relative = { heute: 0, morgen: 1, übermorgen: 2 };
  for (const [word, days] of Object.entries(relative)) {
    if (new RegExp(`\\b${word}\\b`, "i").test(lower)) {
      elements.taskDate.value = dateString(addDays(base, days));
      clean = clean.replace(new RegExp(`\\b${word}\\b`, "i"), "");
      break;
    }
  }
  const weekdays = ["sonntag", "montag", "dienstag", "mittwoch", "donnerstag", "freitag", "samstag"];
  const weekdayIndex = weekdays.findIndex((day) => new RegExp(`\\b${day}\\b`, "i").test(lower));
  if (weekdayIndex >= 0) {
    let difference = (weekdayIndex - base.getDay() + 7) % 7;
    if (difference === 0) difference = 7;
    elements.taskDate.value = dateString(addDays(base, difference));
    clean = clean.replace(new RegExp(`\\b${weekdays[weekdayIndex]}\\b`, "i"), "");
  }
  const time = original.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (time) {
    elements.taskTime.value = `${time[1].padStart(2, "0")}:${time[2]}`;
    clean = clean.replace(time[0], "");
  }
  const priority = original.match(/!(hoch|mittel|niedrig)\b/i);
  if (priority) {
    const map = { hoch: "high", mittel: "medium", niedrig: "low" };
    elements.taskForm.querySelector(`[name="priority"][value="${map[priority[1].toLocaleLowerCase("de")]}"]`).checked = true;
    clean = clean.replace(priority[0], "");
  }
  const repeat = original.match(/@(täglich|taeglich|wöchentlich|woechentlich|monatlich)\b/i);
  if (repeat) {
    const token = repeat[1].toLocaleLowerCase("de");
    elements.taskRepeat.value = token.includes("monat") ? "monthly" : token.includes("wöch") || token.includes("woech") ? "weekly" : "daily";
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
  return state.tasks.filter((task) => occursOn(task, value)).map((task) => ({ task, occurrenceDate: value })).sort((a, b) => sortTasks(a.task, b.task));
}

function overdueOccurrences() {
  return state.tasks.flatMap((task) => {
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

function isOccurrenceComplete(task, date) {
  return task.repeat && task.repeat !== "none" ? (task.completionDates || []).includes(date) : Boolean(task.completed);
}

function sortTasks(a, b) {
  if (Number.isFinite(a.manualOrder) && Number.isFinite(b.manualOrder) && a.manualOrder !== b.manualOrder) return a.manualOrder - b.manualOrder;
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  if (a.time && b.time && a.time !== b.time) return a.time.localeCompare(b.time);
  if (a.time && !b.time) return -1;
  if (!a.time && b.time) return 1;
  return (priorityOrder[a.priority] ?? 1) - (priorityOrder[b.priority] ?? 1) || a.createdAt - b.createdAt;
}

function totalCompletedCount() {
  return state.tasks.reduce((total, task) => total + (task.repeat === "none" ? Number(task.completed) : (task.completionDates || []).length), 0);
}

function completionRate() {
  const today = parseDate(todayString());
  const from = addDays(today, -29);
  let total = 0;
  let completed = 0;
  for (let cursor = from; cursor <= today; cursor = addDays(cursor, 1)) {
    const value = dateString(cursor);
    for (const task of state.tasks) {
      if (!occursOn(task, value)) continue;
      total += 1;
      if (isOccurrenceComplete(task, value)) completed += 1;
    }
  }
  return total ? Math.round((completed / total) * 100) : 0;
}

function bestWeekday() {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  state.tasks.forEach((task) => {
    if (task.repeat === "none" && task.completed) counts[parseDate(task.date).getDay()] += 1;
    (task.completionDates || []).forEach((value) => { counts[parseDate(value).getDay()] += 1; });
  });
  const best = Math.max(...counts);
  if (!best) return "–";
  const index = counts.indexOf(best);
  return ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"][index];
}

function calculateStreak() {
  let streak = 0;
  let cursor = parseDate(todayString());
  const completedOn = (value) => state.tasks.some((task) => occursOn(task, value) && isOccurrenceComplete(task, value));
  if (!completedOn(dateString(cursor))) cursor = addDays(cursor, -1);
  for (let index = 0; index < 365 && completedOn(dateString(cursor)); index += 1) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
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

async function toggleTheme() {
  state.theme = state.theme === "dark" ? "light" : "dark";
  applyTheme();
  await persist();
}

function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
}

function openInfo() {
  elements.weekGoal.value = state.weekGoal;
  renderCategorySettings();
  elements.infoSheet.hidden = false;
  elements.infoBackdrop.hidden = false;
}

function closeInfo() {
  elements.infoSheet.hidden = true;
  elements.infoBackdrop.hidden = true;
}

function populateCategorySelect(selected = elements.taskCategory.value) {
  elements.taskCategory.innerHTML = state.categories.map((category) => `<option value="${escapeHtml(category.id)}">${escapeHtml(category.label)}</option>`).join("");
  if (state.categories.some((category) => category.id === selected)) elements.taskCategory.value = selected;
}

function renderCategorySettings() {
  elements.categoryList.innerHTML = state.categories.map((category) => `<div class="category-setting" data-category-id="${escapeHtml(category.id)}">
    <input type="color" value="${validColor(category.color) ? category.color : "#4f8b69"}" aria-label="Farbe für ${escapeHtml(category.label)}">
    <input type="text" value="${escapeHtml(category.label)}" maxlength="32" aria-label="Name des Bereichs">
    <button type="button" aria-label="Bereich löschen">×</button>
  </div>`).join("");
  elements.categoryList.querySelectorAll(".category-setting").forEach((row) => {
    const id = row.dataset.categoryId;
    row.querySelector('input[type="color"]').addEventListener("change", async (event) => {
      getCategory(id).color = event.target.value;
      await persist();
      render();
    });
    row.querySelector('input[type="text"]').addEventListener("change", async (event) => {
      getCategory(id).label = event.target.value.trim() || "Bereich";
      populateCategorySelect();
      await persist();
      render();
    });
    row.querySelector("button").addEventListener("click", () => deleteCategory(id));
  });
}

async function addCategory() {
  const category = { id: crypto.randomUUID(), label: `Bereich ${state.categories.length + 1}`, color: "#4f8b69" };
  state.categories.push(category);
  populateCategorySelect(category.id);
  renderCategorySettings();
  await persist();
}

async function deleteCategory(id) {
  if (state.categories.length === 1) return showToast("Mindestens ein Bereich muss bleiben");
  const fallback = state.categories.find((category) => category.id !== id);
  state.categories = state.categories.filter((category) => category.id !== id);
  state.tasks.forEach((task) => { if (task.category === id) task.category = fallback.id; });
  populateCategorySelect(fallback.id);
  renderCategorySettings();
  await persist();
  render();
  showToast("Bereich entfernt, Aufgaben wurden verschoben");
}

function getCategory(id) {
  return state.categories.find((category) => category.id === id) || state.categories[0];
}

function exportBackup() {
  const backup = { version: 2, exportedAt: new Date().toISOString(), tasks: state.tasks, categories: state.categories, weekGoal: state.weekGoal, theme: state.theme };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `planbar-backup-${todayString()}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("Backup exportiert");
}

async function importBackup(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  try {
    const imported = JSON.parse(await file.text());
    if (!Array.isArray(imported.tasks)) throw new Error("invalid");
    const merged = new Map(state.tasks.map((task) => [task.id, task]));
    imported.tasks.map(normalizeTask).forEach((task) => {
      const existing = merged.get(task.id);
      if (!existing || task.updatedAt >= existing.updatedAt) merged.set(task.id, task);
    });
    state.tasks = [...merged.values()];
    if (Array.isArray(imported.categories) && imported.categories.length) state.categories = imported.categories.map(normalizeCategory);
    if (imported.weekGoal) state.weekGoal = clamp(Number(imported.weekGoal), 1, 100);
    await persist();
    populateCategorySelect();
    renderCategorySettings();
    render();
    showToast(`${imported.tasks.length} Aufgaben importiert`);
  } catch {
    showToast("Backup konnte nicht gelesen werden");
  }
}

function openFocus(taskId = "") {
  const today = todayString();
  const open = state.tasks.filter((task) => task.repeat === "none" ? !task.completed : occursOn(task, today) && !isOccurrenceComplete(task, today)).sort(sortTasks);
  elements.focusTask.innerHTML = open.length
    ? open.map((task) => `<option value="${task.id}">${escapeHtml(task.title)}</option>`).join("")
    : '<option value="">Keine offene Aufgabe</option>';
  if (open.some((task) => task.id === taskId)) elements.focusTask.value = taskId;
  elements.focusSheet.hidden = false;
  elements.focusBackdrop.hidden = false;
  updateTimerDisplay();
}

function closeFocus() {
  elements.focusSheet.hidden = true;
  elements.focusBackdrop.hidden = true;
}

function setTimerMode(mode) {
  focusState.running = false;
  clearInterval(focusState.interval);
  focusState.mode = mode;
  focusState.total = mode === "focus" ? 25 * 60 : 5 * 60;
  focusState.remaining = focusState.total;
  elements.timerTabs.forEach((button) => button.classList.toggle("active", button.dataset.timerMode === mode));
  elements.startTimer.textContent = "Starten";
  elements.timerStatus.textContent = "Bereit";
  updateTimerDisplay();
}

function toggleTimer() {
  if (focusState.running) pauseTimer();
  else startTimer();
}

function startTimer() {
  if (focusState.remaining <= 0) focusState.remaining = focusState.total;
  focusState.running = true;
  focusState.deadline = Date.now() + focusState.remaining * 1000;
  elements.startTimer.textContent = "Pausieren";
  elements.timerStatus.textContent = focusState.mode === "focus" ? "Konzentriert arbeiten" : "Kurz durchatmen";
  clearInterval(focusState.interval);
  focusState.interval = setInterval(tickTimer, 250);
}

function pauseTimer() {
  if (focusState.running) focusState.remaining = Math.max(0, Math.ceil((focusState.deadline - Date.now()) / 1000));
  focusState.running = false;
  clearInterval(focusState.interval);
  elements.startTimer.textContent = "Fortsetzen";
  elements.timerStatus.textContent = "Pausiert";
  updateTimerDisplay();
}

function resetTimer() {
  focusState.running = false;
  clearInterval(focusState.interval);
  focusState.remaining = focusState.total;
  elements.startTimer.textContent = "Starten";
  elements.timerStatus.textContent = "Bereit";
  updateTimerDisplay();
}

function tickTimer() {
  focusState.remaining = Math.max(0, Math.ceil((focusState.deadline - Date.now()) / 1000));
  updateTimerDisplay();
  if (focusState.remaining > 0) return;
  focusState.running = false;
  clearInterval(focusState.interval);
  elements.startTimer.textContent = "Nochmal";
  elements.timerStatus.textContent = "Geschafft!";
  const task = state.tasks.find((item) => item.id === elements.focusTask.value);
  const message = focusState.mode === "focus" ? `Fokusrunde beendet${task ? `: ${task.title}` : ""}` : "Pause beendet – bereit für die nächste Runde?";
  if (globalThis.chrome?.notifications) chrome.notifications.create(`planbar-focus-${Date.now()}`, { type: "basic", iconUrl: "assets/icon-128.png", title: "Planbar Fokus", message });
  showToast(message);
}

function updateTimerDisplay() {
  const minutes = Math.floor(focusState.remaining / 60);
  const seconds = focusState.remaining % 60;
  elements.timerDisplay.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  elements.timerRing.style.setProperty("--timer-progress", `${focusState.total ? (focusState.remaining / focusState.total) * 360 : 0}deg`);
}

function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  toastTimer = setTimeout(() => elements.toast.classList.remove("show"), 2200);
}

async function loadData() {
  try {
    if (!globalThis.chrome?.storage?.local) return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    const localResult = await chrome.storage.local.get(STORAGE_KEY);
    const localData = localResult[STORAGE_KEY] || {};
    try {
      const sync = await chrome.storage.sync.get(null);
      const meta = sync[SYNC_META_KEY];
      if (!meta) return localData;
      const tasks = Object.entries(sync).filter(([key]) => key.startsWith(SYNC_TASK_PREFIX)).map(([, task]) => task);
      return { ...localData, ...meta, tasks, version: 2 };
    } catch {
      return localData;
    }
  } catch {
    return {};
  }
}

async function persist() {
  const value = { version: 2, tasks: state.tasks, categories: state.categories, weekGoal: state.weekGoal, theme: state.theme, updatedAt: Date.now() };
  if (!globalThis.chrome?.storage?.local) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    return;
  }
  await chrome.storage.local.set({ [STORAGE_KEY]: value });
  try {
    const sync = await chrome.storage.sync.get(null);
    const taskEntries = Object.fromEntries(state.tasks.map((task) => [`${SYNC_TASK_PREFIX}${task.id}`, task]));
    const staleKeys = Object.keys(sync).filter((key) => key.startsWith(SYNC_TASK_PREFIX) && !taskEntries[key]);
    if (staleKeys.length) await chrome.storage.sync.remove(staleKeys);
    await chrome.storage.sync.set({
      [SYNC_META_KEY]: { version: 2, categories: state.categories, weekGoal: state.weekGoal, theme: state.theme, updatedAt: value.updatedAt },
      ...taskEntries,
    });
  } catch (error) {
    console.warn("Planbar Sync nicht verfügbar; lokal wurde gespeichert.", error);
  }
  chrome.runtime?.sendMessage({ type: "PLANBAR_RESCHEDULE_REMINDERS" }).catch(() => {});
}

function todayString() { return dateString(new Date()); }
function dateString(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function parseDate(value) {
  const [year, month, day] = value.split("-").map(Number);
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
function sameDay(a, b) { return dateString(a) === dateString(b); }
function formatLongDate(date) { return capitalize(date.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" })); }
function formatShortDate(date) { return date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }); }
function formatAgendaTitle(date) { return dateString(date) === todayString() ? "Heute" : capitalize(date.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" })); }
function getWeekNumber(date) {
  const value = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  value.setUTCDate(value.getUTCDate() + 4 - (value.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(value.getUTCFullYear(), 0, 1));
  return Math.ceil((((value - yearStart) / 86400000) + 1) / 7);
}
function relativeDayLabel(date) {
  const difference = Math.round((parseDate(dateString(date)) - parseDate(todayString())) / 86400000);
  if (difference === 0) return { eyebrow: "HEUTE", title: "Was steht an?" };
  if (difference === 1) return { eyebrow: "MORGEN", title: "Gut vorbereitet." };
  if (difference === -1) return { eyebrow: "GESTERN", title: "Rückblick." };
  return { eyebrow: date.toLocaleDateString("de-DE", { weekday: "long" }).toUpperCase(), title: `${date.getDate()}. ${capitalize(date.toLocaleDateString("de-DE", { month: "long" }))}` };
}
function daySummary(total, completed) {
  if (!total) return "Noch nichts geplant – der Tag gehört dir.";
  if (total === completed) return "Alles erledigt. Zeit zum Durchatmen.";
  return `${total - completed} ${total - completed === 1 ? "Aufgabe wartet" : "Aufgaben warten"} auf dich.`;
}
function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function capitalize(value) { return value.charAt(0).toUpperCase() + value.slice(1); }
function validColor(value) { return /^#[0-9a-f]{6}$/i.test(String(value || "")); }
function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

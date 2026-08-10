globalThis.PlanbarI18n = (() => {
  const de = {
    "nav.day": "Tag", "nav.week": "Woche", "nav.month": "Monat", "nav.archive": "Archiv",
    "action.focus": "Fokusmodus öffnen", "action.openTab": "In einem ganzen Tab öffnen", "action.saveTab": "Aktuellen Tab als Aufgabe speichern",
    "action.search": "Aufgaben durchsuchen", "action.theme": "Darstellung wechseln", "action.info": "Einstellungen öffnen", "action.today": "Zu heute springen",
    "search.placeholder": "Aufgaben durchsuchen …", "search.close": "Suche schließen", "task.add": "Aufgabe",
    "task.planning": "PLANUNG", "task.new": "Neue Aufgabe", "task.edit": "Aufgabe bearbeiten", "task.titleLabel": "Was möchtest du erledigen?",
    "task.titlePlaceholder": "z. B. Präsentation vorbereiten", "task.smartHint": "Tipp: „Bericht morgen 14:30 #Arbeit !hoch @wöchentlich“",
    "task.date": "Datum", "task.time": "Uhrzeit", "common.optional": "optional", "quick.today": "Heute", "quick.tomorrow": "Morgen",
    "quick.nextWeek": "Nächste Woche", "quick.plusDay": "+1 Tag", "task.priority": "Priorität", "priority.low": "Niedrig",
    "priority.medium": "Mittel", "priority.high": "Hoch", "task.category": "Bereich", "task.repeat": "Wiederholen", "repeat.none": "Nie",
    "repeat.daily": "Täglich", "repeat.weekly": "Wöchentlich", "repeat.monthly": "Monatlich", "task.reminder": "Erinnerung",
    "task.onlyWithTime": "nur mit Uhrzeit", "reminder.none": "Keine Erinnerung", "reminder.now": "Zur Uhrzeit", "reminder.5": "5 Minuten vorher",
    "reminder.15": "15 Minuten vorher", "reminder.30": "30 Minuten vorher", "reminder.60": "1 Stunde vorher", "reminder.1440": "1 Tag vorher",
    "task.subtasks": "Unteraufgaben", "task.addStep": "+ Schritt", "task.stepPlaceholder": "Nächster kleiner Schritt",
    "task.dependencies": "Abhängigkeiten", "task.dependenciesHelp": "Diese Aufgaben müssen zuerst erledigt werden.", "task.noDependencies": "Keine anderen Aufgaben verfügbar.",
    "task.notes": "Notiz", "task.notesPlaceholder": "Details, Links oder Gedanken …", "task.delete": "Aufgabe löschen", "task.deleteConfirm": "Wirklich löschen?",
    "task.archive": "Archivieren", "task.restore": "Wiederherstellen", "task.save": "Speichern",
    "settings.eyebrow": "DEIN PLANER", "settings.title": "Alles im Blick.",
    "settings.description": "Planbar speichert lokal und synchronisiert deine Daten über dein angemeldetes Chrome-Profil.",
    "settings.language": "Sprache", "settings.languageDesc": "Oberfläche und intelligente Eingabe", "language.de": "Deutsch", "language.en": "English",
    "settings.autoArchive": "Automatisch archivieren", "settings.autoArchiveDesc": "Erledigte Aufgaben nach einer Frist ausblenden",
    "archive.never": "Nie", "archive.30days": "Nach 30 Tagen", "archive.90days": "Nach 90 Tagen",
    "settings.weekGoal": "Wochenziel", "settings.weekGoalDesc": "Erledigte Aufgaben pro Woche", "settings.categories": "Eigene Bereiche",
    "settings.categoriesDesc": "Name und Farbe anpassen", "settings.addCategory": "+ Bereich hinzufügen", "settings.export": "Backup exportieren",
    "settings.import": "Backup importieren", "settings.shortcutNew": "Schnell neue Aufgabe", "settings.shortcutSearch": "Suche öffnen",
    "focus.eyebrow": "FOKUSMODUS", "focus.title": "Eine Sache nach der anderen.", "focus.task": "Aufgabe", "focus.session": "Fokus · 25 Min.",
    "focus.break": "Pause · 5 Min.", "focus.ready": "Bereit", "focus.reset": "Zurücksetzen", "focus.start": "Starten", "focus.pause": "Pausieren",
    "focus.resume": "Fortsetzen", "focus.paused": "Pausiert", "focus.working": "Konzentriert arbeiten", "focus.breathe": "Kurz durchatmen", "focus.done": "Geschafft!",
    "category.work": "Arbeit", "category.personal": "Privat", "category.health": "Gesundheit", "category.learning": "Lernen", "category.other": "Sonstiges",
    "common.today": "Heute", "common.tasks": "Aufgaben", "common.open": "Offen", "common.all": "Alle", "common.done": "Erledigt",
    "common.total": "insgesamt", "common.allDay": "Ganztägig", "common.at": "Uhr", "common.restore": "Wiederherstellen",
    "hero.todayEyebrow": "HEUTE", "hero.todayTitle": "Was steht an?", "hero.tomorrowEyebrow": "MORGEN", "hero.tomorrowTitle": "Gut vorbereitet.",
    "hero.yesterdayEyebrow": "GESTERN", "hero.yesterdayTitle": "Rückblick.", "hero.free": "Noch nichts geplant – der Tag gehört dir.",
    "hero.complete": "Alles erledigt. Zeit zum Durchatmen.", "hero.waitingOne": "1 Aufgabe wartet auf dich.", "hero.waitingMany": "{count} Aufgaben warten auf dich.",
    "week.label": "KALENDERWOCHE {number}", "week.title": "Deine Woche", "week.free": "Noch ist diese Woche ganz frei.",
    "week.progress": "{done} von {total} Aufgaben erledigt", "month.label": "MONATSPLANUNG", "month.subtitle": "Plane mit Überblick und bleib flexibel.",
    "summary.openOne": "1 Aufgabe offen", "summary.openMany": "{count} Aufgaben offen", "summary.done": "Alles geschafft!", "summary.high": "{count} mit hoher Priorität",
    "summary.week": "Guter Überblick für die ganze Woche", "summary.pace": "Du bestimmst das Tempo", "section.tasks": "Aufgaben",
    "empty.noDone": "Noch nichts erledigt", "empty.free": "Freier Tag", "empty.allDone": "Alles erledigt", "empty.doneLater": "Abgehakte Aufgaben erscheinen später hier.",
    "empty.plan": "Genieße den Freiraum oder plane eine neue Aufgabe.", "empty.strong": "Stark! Du hast für diesen Zeitraum alles geschafft.",
    "empty.drag": "Ziehe eine Aufgabe hierher oder plane eine neue.", "search.title": "SUCHE", "search.results": "{count} Treffer", "search.for": "Ergebnisse für „{query}“",
    "search.none": "Keine Treffer", "search.try": "Versuche es mit einem anderen Begriff oder Bereich.", "archive.title": "Archiv",
    "archive.subtitle": "Abgeschlossene und abgelegte Aufgaben", "archive.empty": "Noch nichts archiviert", "archive.emptyText": "Archivierte Aufgaben erscheinen hier und können wiederhergestellt werden.",
    "overdue.title": "Überfällig", "overdue.reschedule": "{count} neu einplanen", "task.blocked": "Blockiert · {count} offen", "task.steps": "{done}/{total} Schritte",
    "task.overdue": "Überfällig", "task.repeatMeta": "↻ {value}", "stats.goal": "Wochenziel", "stats.rate": "Erledigungsquote",
    "stats.streak": "Tage in Folge", "stats.bestDay": "Stärkster Wochentag", "toast.saved": "Aufgabe eingeplant", "toast.updated": "Aufgabe aktualisiert",
    "toast.deleted": "Aufgabe gelöscht", "toast.archived": "Aufgabe archiviert", "toast.restored": "Aufgabe wiederhergestellt",
    "toast.blocked": "Erledige zuerst: {tasks}", "toast.tabSaved": "Tab als Aufgabe gespeichert", "toast.noTab": "Kein speicherbarer Browser-Tab gefunden",
    "toast.circular": "Zirkuläre Abhängigkeiten sind nicht möglich", "toast.done": "Geschafft – gut gemacht!", "toast.openAgain": "Wieder als offen markiert",
    "smart.detected": "Erkannt: {items}", "smart.date": "Datum", "smart.time": "Uhrzeit", "smart.category": "Bereich", "smart.priority": "Priorität", "smart.repeat": "Wiederholung"
  };

  const en = {
    ...de,
    "nav.day": "Day", "nav.week": "Week", "nav.month": "Month", "nav.archive": "Archive",
    "action.focus": "Open focus mode", "action.openTab": "Open in a full tab", "action.saveTab": "Save current tab as a task",
    "action.search": "Search tasks", "action.theme": "Switch appearance", "action.info": "Open settings", "action.today": "Jump to today",
    "search.placeholder": "Search tasks…", "search.close": "Close search", "task.add": "Task",
    "task.planning": "PLANNING", "task.new": "New task", "task.edit": "Edit task", "task.titleLabel": "What do you want to get done?",
    "task.titlePlaceholder": "e.g. Prepare presentation", "task.smartHint": "Tip: “Report tomorrow 14:30 #Work !high @weekly”",
    "task.date": "Date", "task.time": "Time", "common.optional": "optional", "quick.today": "Today", "quick.tomorrow": "Tomorrow",
    "quick.nextWeek": "Next week", "quick.plusDay": "+1 day", "task.priority": "Priority", "priority.low": "Low", "priority.medium": "Medium",
    "priority.high": "High", "task.category": "Category", "task.repeat": "Repeat", "repeat.none": "Never", "repeat.daily": "Daily",
    "repeat.weekly": "Weekly", "repeat.monthly": "Monthly", "task.reminder": "Reminder", "task.onlyWithTime": "requires a time",
    "reminder.none": "No reminder", "reminder.now": "At due time", "reminder.5": "5 minutes before", "reminder.15": "15 minutes before",
    "reminder.30": "30 minutes before", "reminder.60": "1 hour before", "reminder.1440": "1 day before",
    "task.subtasks": "Subtasks", "task.addStep": "+ Step", "task.stepPlaceholder": "Next small step", "task.dependencies": "Dependencies",
    "task.dependenciesHelp": "These tasks must be completed first.", "task.noDependencies": "No other tasks available.", "task.notes": "Notes",
    "task.notesPlaceholder": "Details, links, or thoughts…", "task.delete": "Delete task", "task.deleteConfirm": "Really delete?", "task.archive": "Archive",
    "task.restore": "Restore", "task.save": "Save", "settings.eyebrow": "YOUR PLANNER", "settings.title": "Everything in view.",
    "settings.description": "Planbar stores data locally and syncs it through your signed-in Chrome profile.", "settings.language": "Language",
    "settings.languageDesc": "Interface and smart input", "settings.autoArchive": "Auto archive", "settings.autoArchiveDesc": "Hide completed tasks after a delay",
    "archive.never": "Never", "archive.30days": "After 30 days", "archive.90days": "After 90 days", "settings.weekGoal": "Weekly goal",
    "settings.weekGoalDesc": "Completed tasks per week", "settings.categories": "Custom categories", "settings.categoriesDesc": "Customize name and color",
    "settings.addCategory": "+ Add category", "settings.export": "Export backup", "settings.import": "Import backup",
    "settings.shortcutNew": "Quickly create a task", "settings.shortcutSearch": "Open search", "focus.eyebrow": "FOCUS MODE",
    "focus.title": "One thing at a time.", "focus.task": "Task", "focus.session": "Focus · 25 min", "focus.break": "Break · 5 min",
    "focus.ready": "Ready", "focus.reset": "Reset", "focus.start": "Start", "focus.pause": "Pause", "focus.resume": "Resume",
    "focus.paused": "Paused", "focus.working": "Stay focused", "focus.breathe": "Take a short breath", "focus.done": "Done!",
    "category.work": "Work", "category.personal": "Personal", "category.health": "Health", "category.learning": "Learning", "category.other": "Other",
    "common.today": "Today", "common.tasks": "Tasks", "common.open": "Open", "common.all": "All", "common.done": "Completed",
    "common.total": "total", "common.allDay": "All day", "common.at": "", "common.restore": "Restore",
    "hero.todayEyebrow": "TODAY", "hero.todayTitle": "What's on the plan?", "hero.tomorrowEyebrow": "TOMORROW", "hero.tomorrowTitle": "Ready ahead.",
    "hero.yesterdayEyebrow": "YESTERDAY", "hero.yesterdayTitle": "Review.", "hero.free": "Nothing planned yet — the day is yours.",
    "hero.complete": "Everything is done. Time to breathe.", "hero.waitingOne": "1 task is waiting for you.", "hero.waitingMany": "{count} tasks are waiting for you.",
    "week.label": "WEEK {number}", "week.title": "Your week", "week.free": "This week is still completely open.",
    "week.progress": "{done} of {total} tasks completed", "month.label": "MONTHLY PLANNING", "month.subtitle": "Plan with perspective and stay flexible.",
    "summary.openOne": "1 task open", "summary.openMany": "{count} tasks open", "summary.done": "All done!", "summary.high": "{count} high priority",
    "summary.week": "A clear view of the whole week", "summary.pace": "You set the pace", "section.tasks": "Tasks",
    "empty.noDone": "Nothing completed yet", "empty.free": "Free day", "empty.allDone": "All done", "empty.doneLater": "Completed tasks will appear here.",
    "empty.plan": "Enjoy the space or plan a new task.", "empty.strong": "Great work! Everything for this period is done.",
    "empty.drag": "Drag a task here or schedule a new one.", "search.title": "SEARCH", "search.results": "{count} results", "search.for": "Results for “{query}”",
    "search.none": "No results", "search.try": "Try another term or category.", "archive.title": "Archive", "archive.subtitle": "Completed and filed tasks",
    "archive.empty": "Nothing archived yet", "archive.emptyText": "Archived tasks appear here and can be restored.", "overdue.title": "Overdue",
    "overdue.reschedule": "Reschedule {count}", "task.blocked": "Blocked · {count} open", "task.steps": "{done}/{total} steps",
    "task.overdue": "Overdue", "stats.goal": "Weekly goal", "stats.rate": "Completion rate", "stats.streak": "Day streak",
    "stats.bestDay": "Best weekday", "toast.saved": "Task scheduled", "toast.updated": "Task updated", "toast.deleted": "Task deleted",
    "toast.archived": "Task archived", "toast.restored": "Task restored", "toast.blocked": "Complete first: {tasks}", "toast.tabSaved": "Tab saved as a task",
    "toast.noTab": "No browser tab available to save", "toast.circular": "Circular dependencies are not allowed", "toast.done": "Done — great work!",
    "toast.openAgain": "Marked as open again", "smart.detected": "Detected: {items}", "smart.date": "Date", "smart.time": "Time",
    "smart.category": "Category", "smart.priority": "Priority", "smart.repeat": "Recurrence"
  };

  function t(key, values = {}, language = "de") {
    const template = (language === "en" ? en : de)[key] ?? de[key] ?? key;
    return String(template).replace(/\{(\w+)\}/g, (_, name) => values[name] ?? `{${name}}`);
  }

  function apply(root, language) {
    document.documentElement.lang = language;
    root.querySelectorAll("[data-i18n]").forEach((element) => { element.textContent = t(element.dataset.i18n, {}, language); });
    root.querySelectorAll("[data-i18n-placeholder]").forEach((element) => { element.placeholder = t(element.dataset.i18nPlaceholder, {}, language); });
    root.querySelectorAll("[data-i18n-title]").forEach((element) => { element.title = t(element.dataset.i18nTitle, {}, language); });
    root.querySelectorAll("[data-i18n-aria]").forEach((element) => { element.setAttribute("aria-label", t(element.dataset.i18nAria, {}, language)); });
  }

  return { t, apply };
})();

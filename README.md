<p align="center">
  <img src="assets/icon-128.png" width="96" height="96" alt="Planbar logo">
</p>

<h1 align="center">Planbar</h1>

<p align="center">
  A modern todo planner for Chrome — available in the Side Panel or as a full browser tab.
</p>

<p align="center">
  <a href="LICENSE">MIT License</a> · Manifest V3 · No external dependencies
</p>

## About Planbar

Planbar combines a fast todo list with daily, weekly, and monthly planning. The extension runs in Chrome's Side Panel, so it can stay open while you browse. All core features work without an account or external server.

## Highlights

- Daily, weekly, and monthly views
- Side Panel and full-tab modes
- Dates, times, priorities, categories, and notes
- Subtasks with individual progress
- Task dependencies that block completion until prerequisite tasks are done
- Daily, weekly, and monthly recurring tasks
- Chrome notifications with configurable lead times
- Drag and drop between days, for manual sorting, or onto the trash target with undo
- Quick rescheduling to today, tomorrow, next week, or `+1 day`
- Automatic detection of overdue tasks
- Search and filters for open and completed tasks
- Pomodoro focus mode with 25-minute focus sessions and 5-minute breaks
- Custom categories with individual colors
- Light and dark themes
- JSON backup and import
- Manual archive and optional auto-archive after 30 or 90 days
- German and English interfaces, including bilingual Smart Input
- Save the most recently used browser tab as a task, including its source URL
- Capture selected webpage text through the context menu
- Local storage with optional Chrome Sync

## Installation

Planbar can currently be installed as an unpacked Chrome extension:

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode** in the top-right corner.
4. Select **Load unpacked**.
5. Choose the Planbar project directory.
6. Pin the Planbar icon to the Chrome toolbar and click it.

Chrome opens Planbar in the Side Panel. Use the open-in-tab button in the header to run Planbar in a full browser tab.

After an update, reload the extension once from `chrome://extensions`. Chrome may ask you to approve additional permissions when new features are introduced.

## Smart Input

Planbar recognizes planning details directly in a task title in German or English:

```text
Write report morgen 14:30 #Arbeit !hoch @wöchentlich
Write report tomorrow 14:30 #Work !high @weekly
```

| German / English input | Meaning |
| --- | --- |
| `heute`, `morgen`, `übermorgen` / `today`, `tomorrow` | Relative date |
| `montag` through `sonntag` / `monday` through `sunday` | Next matching weekday |
| `14:30` | Time |
| `#Arbeit` / `#Work` | Category |
| `!hoch`, `!mittel`, `!niedrig` / `!high`, `!medium`, `!low` | Priority |
| `@täglich`, `@wöchentlich`, `@monatlich` / `@daily`, `@weekly`, `@monthly` | Recurrence |

## Dependencies and Archive

Dependencies can be selected while creating or editing a task. The compact picker suggests up to eight open, one-time tasks and includes search instead of displaying the entire task database. A dependent task remains visibly blocked and cannot be completed until all prerequisites are done. Planbar prevents circular dependency chains.

Tasks can be archived manually from the edit dialog. The dedicated Archive view keeps them available for restoration without cluttering planning views, search, statistics, or focus mode. Auto-archive can be disabled or configured for completed tasks after 30 or 90 days.

## Save a Browser Tab

Use the tab button in Planbar's header to turn the most recently used regular browser tab into a task for today. The page title becomes the task title, and the full URL is saved in the notes. Internal browser and extension pages are excluded.

## Reminders

A task needs both a time and a selected reminder interval before Planbar can notify you. Reminders use Chrome's `alarms` and `notifications` APIs. Notifications must also be enabled for Chrome in your operating system.

## Context Menu Capture

Select text on any webpage, open the context menu, and choose **Add to Planbar**. Planbar creates a task for the current day and stores the source page in the task notes.

> The current extension interface displays the context-menu action in German as **„Zu Planbar hinzufügen“**.

## Data Storage and Privacy

Planbar does not require a proprietary server and does not send data to the developer.

- `chrome.storage.local` is the durable local source of truth.
- `chrome.storage.sync` mirrors tasks for Chrome profiles with sync enabled.
- Backups can be exported and restored as JSON files.
- Tasks remain available after closing Chrome or restarting the computer.

Chrome may assign a different extension ID when the unpacked extension is installed on another computer. In that case, JSON export and import provide a reliable transfer method.

## Permissions

| Permission | Purpose |
| --- | --- |
| `storage` | Local persistence and Chrome Sync |
| `sidePanel` | Persistent Planbar view next to webpages |
| `notifications` | Task reminders and focus timer alerts |
| `alarms` | Reliable time-based reminder scheduling |
| `contextMenus` | Capture selected text as a task |
| `tabs` | Read the title and URL of the tab you explicitly save as a task |

Planbar does not read page contents or store browsing history. Tab metadata is accessed only when you use the save-tab button.

## Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `Cmd/Ctrl + Enter` | Create a new task |
| `Cmd/Ctrl + K` | Open search |
| `Esc` | Close the active dialog |

## Development

Planbar uses vanilla HTML, CSS, and JavaScript and has no runtime dependencies.

```bash
npm test
npm run check
```

`npm run check` validates JavaScript syntax and runs smoke tests for task logic, smart input, reminders, context-menu capture, and background services.

### Project Structure

```text
assets/             Icons and source assets
tests/              Logic and background service tests
background.js       Service worker, reminders, and context menu
i18n.js             German and English interface strings
manifest.json       Chrome Manifest V3 configuration
sidepanel.html      Extension interface
sidepanel.js        Planning, persistence, and interactions
styles.css          Responsive layout and themes
```

## Contributing

Issues and pull requests are welcome. Please run `npm run check` before submitting a pull request, and keep changes focused and easy to review.

## License

Planbar is released under the [MIT License](LICENSE).

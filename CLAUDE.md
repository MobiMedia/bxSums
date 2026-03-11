# CLAUDE.md — bxSums Project Guide

## What this project is

A Tampermonkey/Greasemonkey userscript that enhances Bitrix24 task management boards for German Bitrix instances (`https://bitrix.*.de/*`). It adds hour/story point sum calculations to kanban boards and sprints, tag badges on task cards, and utility buttons in the task detail view.

## File overview

| File | Purpose |
|------|---------|
| `bxSums.js` | Main script — all logic, DOM manipulation, event handling |
| `bxSums.meta.js` | Tampermonkey metadata — version, update/download URLs, @require |
| `bxSumsCards.css` | Card/tag styles, sprint/backlog layout — loaded dynamically at runtime |
| `bxSums.css` | Kanban board enhancements — dense mode, picture hiding, spacer columns |
| `README.md` | Installation and usage instructions |

## Versioning rules

- **When changing `bxSums.js`**: always bump the `@version` in **both** `bxSums.js` and `bxSums.meta.js`. Tampermonkey reads the meta file to detect updates.
- **When changing only CSS files** (`bxSumsCards.css`, `bxSums.css`): no version bump needed. CSS is loaded dynamically from GitHub Pages at runtime — users get the latest CSS on next page load without a script update.

## Deployment

- Hosted on GitHub Pages at `https://mobimedia.github.io/bxSums/`
- Pushing to `master` deploys automatically
- CSS cache busting is handled by the query string in the `<link>` tag (e.g. `bxSumsCards.css?36`) — increment this number when a CSS change must bypass browser caches

## Key patterns

- **jQuery alias**: `window._$` is used everywhere (avoids conflict with Bitrix's own jQuery via `$.noConflict(true)`)
- **Underscore.js**: used for `_.debounce()`, `_.delay()` — always prefer these over raw `setTimeout` for DOM-triggered recalculations
- **Settings**: persisted in `localStorage` — keys: `calcMode`, `showPics`, `denseMode`, `showMode`
- **Calculated flag**: `.calculated` CSS class on column bodies prevents redundant recalculations; always remove it before forcing a recalc
- **Tag format**: tags are written as `[TAGNAME]` in task titles; `processTags()` extracts them and renders color-coded `.bsTags` badges using CSS class names (lowercase tag name)
- **REST tag**: `[Rest: X]` in a task title sets remaining hours; parsed via `/^Rest.*?([\d.,]+)\s*?$/`
- **Time format**: German locale — comma as decimal separator (`2,5h`), parsed by `timeStrToSeconds()`
- **Dual data source**: prefers Bitrix's `Kanban.columns` JS object when available; falls back to pure DOM parsing

## Testing CSS changes

Since CSS is loaded remotely, the fastest way to test is to inject styles directly in the browser console on a live Bitrix page:

```javascript
const style = document.createElement('style');
style.textContent = `/* your CSS here */`;
document.head.appendChild(style);
```

## Testing JS changes

Update the script directly in Tampermonkey (Dashboard → edit), then reload the Bitrix page. No build step required.

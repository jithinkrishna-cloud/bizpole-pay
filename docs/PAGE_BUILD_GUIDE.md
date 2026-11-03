# Page build guide (dashboard)

How to build or finish a page in `public/app.html`. **The finished reference page is `public/pages/transactions.js`.** Every page should reach that level.

## Structure

- `public/app.html` is the **core**. It holds the CSS design system, router, shell (sidebar and top bar), the API client and data loading, and shared helpers. Server routes live in `server/routes/<page>.js`. **Don't edit it** while working on a page.
- `public/pages/<page>.js` holds one page each. They are plain `<script>` files loaded after the core and share its global scope.
- Each file registers `PAGES.<route> = () => htmlString` and, if it needs event handlers, `BIND.<route> = () => { ... }`. The router runs `BIND` after rendering.
- **Avoid name clashes.** Every top-level name is shared across all page files, and a duplicate `const`/`function` breaks the whole app. Wrap new code in an IIFE, `(() => { ... })();`, and assign `PAGES.x` / `BIND.x` inside it. If an inline `onclick="..."` needs a function, expose it as `window.<page>_<name>`.
- **Page-specific CSS:** call `addStyle('<page>', \`...css...\`)` from your page file. Reuse core classes first.

## Core helpers and data (globals)

| Name | What |
|---|---|
| `$`, `esc(s)`, `inr(paise)`, `fmtDate(d)`, `toast(msg)` | DOM query, HTML-escape, rupee format (handles negatives), date format, toast message |
| `head(title, subtitle, actionsHtml)` | Standard page header |
| `statusPill(STATUS)` | Coloured status pill (SUCCESS, FAILED, PENDING, QUEUED, IN_PROGRESS, ACTIVE, EXPIRED, …) |
| `locked(what)` | "Unlocks in live mode" card. Use it when `liveLocked()` is true |
| `openDrawer(html)`, `openModal(html)`, `closeAll()` | Right-hand detail panel, centre dialog, close both |
| `go(route)`, `route()` | Navigate, re-render the current route |
| `state` | `{ user, merchant, role, mids, mode: 'test'\|'live', onboarding, saltShown }` |
| `isLive()`, `liveLocked()`, `D()` | Mode helpers; `D()` = this mode's transactions |
| `data`, `refunds`, `settlements` | Transactions, refunds, settlements per mode, loaded from `GET /api/payments` (mode-keyed: `x[state.mode]`) |
| `links`, `webhooks`, `apiKeys` | Mode-keyed stores filled by their page loaders |
| `api(path, { method, body, mode })` | Fetch `/api<path>?mode=<state.mode>` as JSON; throws `Error(message)` on failure. `apiFail(e)` shows it as a toast |
| `LOAD.<page> = async (mode) => {}` | Page data loader. All loaders run after login and on every mode switch, so `PAGES.x` renders synchronously |
| `reload()`, `applyMe(me)` | Re-fetch the current mode and redraw; refresh `state` from `GET /api/auth/me` |
| `MODES`, `now` | Payment-method labels; current time (refreshed on each load) |
| `addStyle(id, css)` | Inject page CSS once |
| Transactions helpers you may **copy** (not call; they use Transactions-only state) | `toolbar`, `kpis`, `emptyState`, `pager`, `closeMenus` patterns |

**CSS classes in core:**
- Layout and containers: `card`, `grid g2/g3/g4/g-21/g-ob`, `kpi`, `tbl-wrap`, `kv`
- Buttons and badges: `btn primary/sm/danger`, `pill ok/warn/bad/brand`, `chip`, `chip brand`
- Toolbar, search and dropdowns: `toolbar`, `searchbox`, `dd` + `menu` (+ `right`/`wide`/`open`), `ck`
- Tables: `th.sortable`, `empty-state`, `pager`
- Other: `tabs`, `promo`, `drop`, `code`, `notice bad`, `row`, `between`, `muted`, `mono`, `tile`, `steps/step`, `prog`, `bars`, `hbar`

## Colour palette (brand: warm accents, grounded foundation)

| Token | Hex | Use |
|---|---|---|
| `--ink` Charcoal | `#211F24` | Main text, logo, strong surfaces (sidebar) |
| `--brand` Coral | `#E65F55` (hover `#D14E44`, soft `#FBE8E6`) | Primary buttons, key markers, active tab. Use sparingly (~4%) |
| `--accent` Solar yellow | `#F1C64B` (soft `#FCF3D9`) | Highlights, progress cues, small emphasis (~6%) |
| `--bg` Warm paper | `#F6F4EF` | Page background (~70% light overall) |
| `--ink-2` Graphite | `#343138` | Secondary headings, dark panels, chart bars |
| `--soft` Soft neutral | `#EEECE7` | Quiet surfaces, table headers, dividers |
| `--card` | `#FFFEFB` | Cards and dialogs |

- **Always use the CSS variables** (`var(--brand)` etc.), never hard-coded hex.
- **Status colours stay semantic:** `--ok` green, `--warn` amber, `--bad` red.
- **Chart series order:** `#211F24` charcoal, `#E65F55` coral, `#F1C64B` yellow, `#8A858F` graphite tint, `#CDB89A` warm sand, `#F2A39C` light coral. A comparison or previous-period series uses `#B9B4AD`, dashed.
- **No purple** (`#4b3bdb`, `#7b6cff`, `#efecff`, `#14122b`). Those are the old palette.

## What a "finished" page has

1. It **fills the width** at 1680 px with no awkward empty areas. Cards in a row are equal height; put footers on `margin-top:auto`.
2. **Header:** title, one-line purpose, the main action(s) on the right.
3. **Summary cards** (3–4) computed from the same data the table shows.
4. **Toolbar** where there's a list: search (with a field picker if more than one ID type), date range, Filter dropdown with a count badge, Download.
5. A **table** with the key fields; sortable date and amount; pagination of 10; status pills; amounts right-aligned.
6. **Row click opens a detail panel** with all fields, a timeline or progress, and the next actions.
7. **Create/edit flows** happen in dialogs with validation and a success message, and the new item appears in the list immediately.
8. An **empty state** that tells the user how to get out of it.
9. **Test vs live:** respect `liveLocked()`; switching mode must not crash.
10. **Numbers are consistent** with other pages (e.g. settlements are built from real successful payments).
11. **Phone width** (390 px) doesn't scroll sideways; the core already stacks grids under 820 px.
12. Original Paynest wording and design. **No PayU logos, images or copied text**; PayU may be named only as the processor.

## Verifying with REA (required)

The server should already be running (`node scripts/serve.js 8765`). If `http://127.0.0.1:8765/app.html` doesn't load, start it.

Use the `mcp__rea__capture_browser_scenario` tool:
```json
{ "browser": {"mode":"launch","executable_path":"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"},
  "start_url": {"url":"http://127.0.0.1:8765/app.html"},
  "actions": [
    {"step_id":"login","action":"click","locator":{"kind":"role","role":"button","name":"Log in"},"timeout_ms":5000},
    {"step_id":"go","action":"click","locator":{"kind":"css","selector":"aside a[href='#/<route>']"},"timeout_ms":5000},
    {"step_id":"wait","action":"wait_for_timeout","duration_ms":2600}],
  "capture": {"at_end":["url","screenshot"],"events":["page-errors"]},
  "environment": {"viewport":{"width":1680,"height":1100,"device_scale_factor":1}} }
```

- **Take the screenshot only at the end** (`at_end`). Capturing after every step produces stale frames.
- Run **one scenario per state**: list, open drawer, open dialog, empty state, and so on.
- `step_id` must start with a letter.
- CSS locators must match exactly one element.

The result is too big to show inline, so it gets saved to a file. Pull out the screenshot and the page errors with:
```
node "C:/Users/Admin/AppData/Local/Temp/claude/c--Users-Admin-Desktop-rea-clone/ffdc68a8-0de5-4018-990e-c47943591042/scratchpad/shot1.js" "<saved result file>" "<out.png>"
```
Then open the PNG with Read and look at it. Fix what you see, re-shoot, and repeat until the page is right with **0 page errors**. Before every REA run, check each file you changed with `node --check public/pages/<file>.js`.

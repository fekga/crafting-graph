# PoE Crafting Graph

A static, no-backend app for building Path of Exile crafting flows. Everything
runs in the browser — nothing to host except plain files.

## Stack
- React + TypeScript + Vite
- @xyflow/react
- Browser `localStorage` for saved recipes
- URL-encoded (lz-string compressed) sharing — no server, no database

## Run locally
```bash
npm install
npm run dev
```
Open http://localhost:5173.

## Build
```bash
npm run build
```
Outputs a fully static site to `dist/`. Open `dist/index.html` directly, or
serve the folder with any static file host.

## Features
- Add crafting nodes, connect them with arrows — the arrowhead always
  marks the target end, even for a connection that loops backward
- **Undo / redo** — Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z (or the Undo/Redo
  buttons), covering the graph's actual content (nodes and connections).
  Rapid changes like dragging a node or typing are coalesced into one
  step rather than one per keystroke/pixel. History resets when you
  switch to a different graph entirely (New, Clear all, Import, Load, or
  opening a shared link) — undoing into a graph you just replaced would
  be more confusing than useful.
- **Multi-select** — shift-click nodes, or drag a selection box across
  the canvas, to select several at once; the sidebar then offers
  "Duplicate selected" / "Remove selected" for bulk actions
- **Guide me** — steps through the graph one node at a time instead of
  showing the whole thing at once. Select a starting node (or just click
  "Guide me" if there's one obvious starting point) and it shows that
  step's modifiers/notes/cost in the sidebar with the node highlighted on
  canvas; if it has more than one outgoing connection (e.g. "hit the mod"
  vs. "didn't, try again"), pick which one actually happened to move on.
  Tracks what's actually been spent along the path taken, separately from
  the graph-wide cost total. Back/Restart/Exit controls included.
- The sidebar is resizable (drag the thin handle on its left edge) and
  collapsible (the little ◂/▸ tab on that handle); both are remembered
  across sessions
- Give a connection a short text label (click/hover it to edit) — the 🖼
  button on the label inserts a currency/item icon into it, same as notes;
  toggle "Animate edges" in the toolbar for a marching-dash line across
  the whole graph
- Build your own modifiers with the "+ Add" affix editor: write the mod
  text yourself, pick its text color from a Path of Exile-inspired palette
  (or any custom hex/color-wheel value), and attach any number of tags —
  Prefix, Suffix, Implicit, Enchant come built in, plus special cases like
  Fractured or Crafted, and you can create, rename, recolor, or delete your
  own custom tags too. A modifier can carry several tags at once (e.g.
  Prefix + Fractured).
- Currency icons — pick from ~140 real currency icons (orbs, shards,
  essences, fossils, resonators, catalysts, oils, omens), plus a "Browse
  all item art" tab covering every item in the game (uniques, base types,
  gems, flasks, and more), all sourced from
  [repoe-fork](https://repoe-fork.github.io/)'s art tree and item data
  export — no external services, no API keys
- Real item names, not internal codenames — "InjectorBelt" shows as
  "Mageblood", resolved against repoe-fork's unique-item and base-item
  catalogs
- Recursive search in the art browser: search a category (or everything)
  and it crawls every subfolder, not just the one you're in
- A picked icon sticks to the action/cost field even if you edit the text
  next to it afterward (e.g. picking Mageblood's icon, then renaming the
  field to "Mageblood (6-linked)") — "Remove icon" clears it explicitly
- Give any step one or more costs (currency, amount, chance of success —
  e.g. a fossil *and* a resonator used together) and see a running total
  across the whole graph, per currency
- Adjustable icon size for the item shown on each node (currency icons
  stay compact)
- Embed currency icons inside notes too, via the "+ Currency icon" button
  in the notes toolbar (uses a `{{currency:Name}}` shortcode under the hood)
- Notes support Markdown (bold, lists, links, headings, etc.)
- A node's notes (rendered, with icons) show directly on the graph, not
  just in the sidebar
- Remove a node with the × button that appears on hover; remove a
  connection with the × button that appears on its midpoint (or select it
  and press Backspace/Delete)
- **New** resets to a single starting node; **Clear all** empties the
  canvas completely. Both reset the URL to `.../crafting-graph/new` — the
  app's default URL when there's no shared graph loaded.
- **Export text / Import text** — Export produces a compact, copy-pasteable
  text blob encoding the entire graph, including your custom tag library
  (no URL length limits, so it scales to large graphs). Paste it back in
  via Import on any device to load the exact same graph.
- **Shareable links** — "Create shareable link" uploads the export text to
  rentry.co and hands back a link on this app's own domain, e.g.
  `https://fekga.github.io/crafting-graph/hello`. Opening that link loads
  the app with the graph already in, rather than the bare rentry page.
  (GitHub Pages has no server-side routing, so `public/404.html` bounces a
  fresh visit to a link like that back to the app with the slug preserved.)
  The Import tab accepts either that link or a raw rentry.co one.
- Save/load named graphs locally in the browser, or export text to carry a
  graph between devices
- Starts with a small example graph
- A dark, gold-and-bronze Path of Exile-inspired theme, including a subtle
  procedural grain texture (no external image assets needed)

## Deploying to GitHub Pages
This repo includes a GitHub Actions workflow (`.github/workflows/deploy.yml`)
that builds and deploys automatically.

1. Push this project to a GitHub repository.
2. In the repo settings, go to **Settings → Pages** and set **Source** to
   **GitHub Actions**.
3. Push to `main` (or run the workflow manually from the Actions tab).
4. Your site will be live at `https://<your-username>.github.io/<repo-name>/`.

The Vite config uses a relative `base: './'`, so the build works from any
subpath — no need to hardcode your repo name anywhere.

### Manual deploy (alternative)
If you'd rather not use Actions, you can build locally and push the `dist/`
folder to a `gh-pages` branch using a tool like
[`gh-pages`](https://www.npmjs.com/package/gh-pages):
```bash
npm run build
npx gh-pages -d dist
```

## Notes on exported text
Exported text can be sent anywhere (chat, email, a text file) and imported
on any device/browser, with no account and no size limit like a URL would
have. The text isn't encrypted, just compressed — anyone with it can decode
it. Local saves live only in that browser's `localStorage`, so export text
if you want a copy that survives clearing site data or moving devices.

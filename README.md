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
- Add crafting nodes, connect them with arrows
- Build your own modifiers with the "+ Add" affix editor: write the mod
  text yourself, pick its text color from a Path of Exile-inspired palette
  (or any custom hex/color-wheel value), and attach any number of tags —
  Prefix, Suffix, Implicit, Enchant come built in, plus special cases like
  Fractured or Crafted, and you can create, rename, recolor, or delete your
  own custom tags too. A modifier can carry several tags at once (e.g.
  Prefix + Fractured).
- Currency icons — pick from ~140 real currency icons (orbs, shards,
  essences, fossils, resonators, catalysts, oils, omens), sourced from the
  [PoE Wiki's currency icon files](https://www.poewiki.net/wiki/Category:Currency_item_icons)
- Embed currency icons inside notes too, via the "+ Currency icon" button
  in the notes toolbar (uses a `{{currency:Name}}` shortcode under the hood)
- Notes support Markdown (bold, lists, links, headings, etc.)
- A node's notes (rendered, with icons) show directly on the graph, not
  just in the sidebar
- One **Edit / Preview** toggle for the whole side panel: Edit shows the
  normal editable form; Preview shows a clean read-only rendering of the
  same step (name, action + icon, modifiers, and rendered notes). The graph
  canvas itself always renders in preview form — there's no separate
  edit-on-canvas mode.
- Remove a node with the × button that appears on hover; remove a
  connection with the × button that appears on its midpoint (or select it
  and press Backspace/Delete)
- **Export text / Import text** — Export produces a compact, copy-pasteable
  text blob encoding the entire graph, including your custom tag library
  (no URL length limits, so it scales to large graphs). Paste it back in
  via Import on any device to load the exact same graph. This is the only
  way to save/restore a graph — there's no in-browser save/load list.
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
it. Since there's no local save, hang on to the exported text if you want
to come back to a graph later — closing the tab without exporting loses
your changes.

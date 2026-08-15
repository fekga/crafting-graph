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
- Add crafting nodes, connect them, label outcomes (success/failure/partial)
- Edit node name, action, required modifiers and notes
- Save/load recipes — stored locally in your browser (`localStorage`), so
  they persist between visits on the same device/browser
- **Share link** — click "Share link" to copy a URL that encodes the entire
  recipe (compressed) directly in the link. Anyone who opens it gets an
  editable copy loaded automatically, no account or server needed. Note:
  very large graphs make longer URLs — this is fine for typical recipes but
  isn't meant for huge graphs.
- Delete saved recipes
- Starts with a small example graph

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

## Notes on saved recipes vs. shared links
- **Saved recipes** live only in your browser's `localStorage` — they are
  private to you and won't sync across devices or browsers.
- **Share links** carry the full recipe in the URL itself, so they work for
  anyone, anywhere, with no account — but the recipe data is visible to
  anyone with the link (it's just compressed, not encrypted).

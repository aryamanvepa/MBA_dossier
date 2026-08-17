# MBA_dossier
MBA essays, deadlines, and a gamified writing workspace — sprints, streaks, XP, badges, and AI draft feedback.

## GitHub Pages (hosted copy)
The live version at the repo's Pages URL serves `index.html` as a static file. There's no server behind it, so:
- Drafts, status, and XP save to that browser's `localStorage` only — not synced with a locally-run copy, and cleared if you clear site data.
- AI feedback is unavailable (it needs the local proxy server for the API key).
- Sprints, streaks, badges, and the Quest Board all still work.

## Running locally (full version)
```bash
npm install
npm start
```
Then open `http://localhost:4173`. This runs a small local server that:
- Persists everything to `data/store.json` on disk (gitignored — your drafts never leave your machine).
- Proxies AI feedback requests to the Claude API. Copy `.env.example` to `.env` and set `ANTHROPIC_API_KEY` to enable it.

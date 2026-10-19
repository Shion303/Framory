# AGENTS.md

## Project Context

Framory is a single-user React + Vite app. Keep changes focused on the user's request and preserve existing project conventions.

Start with `README.md` for local setup.

## Key Files

- `src/App.jsx`: the whole UI (Home, Discovery, Watchlist, Detail, Settings).
- `src/framory.js`: data layer — Dexie schema, AniList/Jikan providers, franchise
  grouping, episode loading, user-override model, background sync.
- `vite.config.js`: Vite + PWA config with `@` → `src` alias.
- `eslint.config.js` / `jsconfig.json`: lint/typecheck the live `src/**` files.

## Working Notes

- Use `npm run dev` for local development.
- User data is persisted in the browser via IndexedDB. Do not reintroduce a hosted BaaS unless requested.
- Catalog source is AniList (primary) with Jikan/MAL as fallback and for episode titles. Keep TMDB out of the anime flow.
- Episode titles/thumbnails come from AniList `Media.streamingEpisodes` (Crunchyroll); Jikan provides titles when AniList has none.
- User overrides (`checked`, `removed`, `order`, `partOrder`, `status`) live in the `entries` table and must never be touched by sync.
- Run `npm run lint`, `npm run typecheck`, and `npm run build` before finishing code changes.

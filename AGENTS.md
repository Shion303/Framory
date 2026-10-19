# AGENTS.md

## Project Context

Framory is a single-user React + Vite app. Keep changes focused on the user's request and preserve existing project conventions.

Start with `README.md` for local setup.

## Key Files

- `src/App.jsx`: the whole UI (Home, Discovery, Watchlist, Detail, Settings).
- `src/framory.js`: data layer — Dexie schema, AniList/Jikan providers, franchise
  grouping, episode loading, user-override model, background catalog sync, and the
  pure cloud-merge helpers (`buildDoc`/`normalizeDoc`/`docToStores`/`mergeDocs`/`bumpDeleted`).
- `src/supabase.js`: optional cloud sync (env-gated). One JSON row per shared library
  in the `watchlists` table; no manual sync codes.
- `supabase/schema.sql`: SQL to create the `watchlists` table, RLS policies and realtime.
- `vite.config.js`: Vite + PWA config with `@` → `src` alias.
- `eslint.config.js` / `jsconfig.json`: lint/typecheck the live `src/**` files.

## Working Notes

- Use `npm run dev` for local development.
- User data is persisted in the browser via IndexedDB (`franchises`, `entries`, `meta`).
- Cloud sync is automatic and transparent when `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`
  are set (`.env.local`); otherwise the app runs local-only. There is no Sync Code UI:
  devices share the fixed `VITE_FRAMORY_LIBRARY_ID` row (default `framory-global`).
- Cross-device merge is per-item last-write-wins by `updatedAt` with deletion tombstones
  (`deleted` map), so both devices can edit without losing data.
- Discovery search runs Jikan v4 REST (`/v4/anime?q=...&limit=15`, preflight-free GET)
  and AniList GraphQL **in parallel**; the first non-empty response wins, so blocking one
  provider never breaks search. `searchGroupsDetailed` reports `failed` when every provider
  errored (drives the retry affordance); `searchGroups` always returns an array and never
  throws. Keep TMDB out of the anime flow.
- Episode titles/thumbnails come from AniList `Media.streamingEpisodes` (Crunchyroll); Jikan provides titles when AniList has none.
- Catalog sync (`syncLibrary`) enriches franchises but must never overwrite user overrides
  (`checked`, `removed`, `order`, `partOrder`, `status`) in `entries`. Cloud sync *does*
  propagate those overrides between the user's own devices.
- Run `npm run lint`, `npm run typecheck`, and `npm run build` before finishing code changes.

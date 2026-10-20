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
  every device shares the fixed global row `VITE_SYNC_ID` (default `global_user_watchlist`),
  so PC and phone read/write the same `watchlists` row. On startup the app pulls before
  first paint and re-pushes the merged library if the cloud was behind; every mutation
  triggers a coalesced (~250ms) upsert. Realtime `postgres_changes` streams remote edits.
- Cross-device merge (`mergeDocs`) is per-item last-write-wins by `updatedAt` with deletion
  tombstones (`deleted` map) and is clock-skew safe: it never gates the whole doc on a
  `Date.now()` comparison. `docSignature` detects real content changes so a device only
  re-pushes when it actually holds data the cloud lacks (prevents echo loops).
- AniList requests send `Authorization: Bearer $VITE_ANILIST_TOKEN` when set (higher rate
  limits); anonymous access still works without it.
- Discovery search runs Jikan v4 REST (`/v4/anime?q=...&limit=15`, preflight-free GET)
  and AniList GraphQL **in parallel**; the first non-empty response wins, so blocking one
  provider never breaks search. `searchGroupsDetailed` reports `failed` when every provider
  errored (drives the retry affordance); `searchGroups` always returns an array and never
  throws. Keep TMDB out of the anime flow.
- Episode titles/thumbnails come from AniList `Media.streamingEpisodes` (Crunchyroll); Jikan provides titles when AniList has none.
- Watchlist status is a closed set of exactly 4 official states (no others are allowed):
  `planned` "Pianificato" (default on add), `watching` "Sto guardando" (first episode
  checked / partial progress), `completed` "Completata" (100% and franchise finished),
  `ongoing` "In corso" (100% but awaiting future seasons — **manual only, never auto /
  never from AniList**). `defaultEntry` seeds `status: "planned"`; `computeStatus` returns
  `watching` (not `ongoing`) when a non-finished franchise is 100%. `migrateStatus`
  converts any legacy value (`hold`, `paused`, `Plan to Watch`, unknown…) to `planned`;
  `sanitizeStores` applies it on load/merge and reports `migrated` so the app re-pushes to
  cloud. UI: `WATCH_SEGMENTS` + `STATUS_OPTIONS` use the 4 exact labels; add toast is
  "Aggiunto a Pianificato"; status is editable from both the Detail modal and the
  per-card quick `StatusPicker`.
- Catalog sync (`syncLibrary`) enriches franchises but must never overwrite user overrides
  (`checked`, `removed`, `hiddenParts`, `order`, `partOrder`, `status`, `notes`) in `entries`. Cloud sync
  *does* propagate those overrides between the user's own devices. Personal per-series
  `notes` live on the entry and travel in the same JSON payload. Deleting a whole
  season/movie/OVA is a tap on the "Elimina stagione" button in the title block (Detail +
  Discovery when already added) → `removePart` adds the part id to `hiddenParts` and drops
  its episodes from `checked`/`order`; if it was the last part, the app removes the whole
  franchise; `orderedParts`/`partItemsMap` filter `hiddenParts` everywhere.
- Discovery selection is smart: opening a series not in the WatchList pre-selects every
  part and the CTA is "Aggiungi a Pianificato"; if it is already in the WatchList only the
  new/missing parts are pre-selected and the CTA is "Aggiungi elementi selezionati". Users
  can toggle any part. `addSelectedToWatchlist` never overwrites an existing card: for an
  existing series it calls `mergeFranchiseParts(oldFr, newMembers)` which rebuilds the
  franchise (correct order/labels) but restores the existing part objects, so user
  overrides (`checked`, `notes`, `hiddenParts`, `order`, `status`) and episode data are
  kept; only the new parts get their episode titles/thumbnails loaded.
- Run `npm run lint`, `npm run typecheck`, and `npm run build` before finishing code changes.

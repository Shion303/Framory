# AGENTS.md

## Project Context

Framory is a single-user React + Vite app. Keep changes focused on the user's request and preserve existing project conventions.

Start with `README.md` for local setup.

## Key Files

- `src/`: frontend application source.
- `src/lib/api/`: local data layer (IndexedDB collections + file uploads).
- `src/lib/db/database.js`: Dexie database schema.
- `src/lib/tvmaze.js`: TVmaze client for external TV/anime metadata.
- `vite.config.js`: Vite config with `@` → `src` alias.

## Working Notes

- Use `npm run dev` for local development.
- User data is persisted in the browser via IndexedDB. Do not reintroduce a hosted BaaS unless requested.
- Keep TVmaze as the external catalog source.
- Run the relevant checks from `package.json` before finishing code changes.

# Framory

Personal tracker for TV series, anime, and films. Framory is a single-user React + Vite app. Library data lives in the browser (IndexedDB). Show metadata comes from the public [TVmaze](https://www.tvmaze.com/api) API.

## Prerequisites

1. Clone this repository.
2. Install dependencies: `npm install`.

No backend, cloud account, or environment variables are required.

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite.

## Build

```bash
npm run build
npm run preview
```

## Data

Framory stores these collections in IndexedDB (`framory`):

- Content, Season, Episode
- EpisodeProgress, LibraryItem
- Franchise, FranchiseContent
- Trophy, SyncStatus, MergeHistory

Use **Settings → Data** to export a JSON backup, import a backup, or reset all data. Clearing site data for this origin also removes the local library.

TVmaze remains the external source for search, details, seasons, episodes, images, ratings, genres, discovery, schedule, and sync.

## Environment variables

See `.env.example`. The app does not require secrets or API keys.

## Checks

```bash
npm run lint
npm run typecheck
npm run build
```

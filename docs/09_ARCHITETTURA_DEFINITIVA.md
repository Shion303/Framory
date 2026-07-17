# Architettura Definitiva

## Audit e contraddizioni

Il repository iniziale non conteneva la cartella `docs/`; la specifica incollata nel task viene quindi assunta come fonte iniziale e riportata in `docs/FRAMORY_SPECIFICA_COMPLETA.md`. Non sono emerse contraddizioni tecniche non risolvibili: PostgreSQL/Supabase resta il percorso produzione, mentre l'adapter file è limitato a sviluppo e test locali dove non sono disponibili credenziali reali.

## Scelta architetturale

Framory usa una monolite Next.js App Router:

- UI e route applicative in `src/app`;
- componenti client in `src/components`;
- contratti e validazione in `src/lib`;
- sicurezza, sessioni, regole dominio e persistenza in `src/server`;
- schema database e migration in `prisma`;
- test unitari in `tests`;
- test end-to-end in `e2e`.

La persistenza è mediata da un'interfaccia `FramoryStore`. In produzione `FRAMORY_STORAGE=prisma` usa Prisma/PostgreSQL. In sviluppo e test `FRAMORY_STORAGE=file` usa un file JSON locale escluso da Git, utile per verificare flussi senza modificare un progetto Supabase reale.

## API necessarie

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/me`
- `GET /api/home`
- `GET /api/franchises`
- `GET /api/franchises/[slug]`
- `POST /api/library`
- `GET /api/library`
- `PATCH /api/library/[franchiseId]`
- `DELETE /api/library/[franchiseId]`
- `POST /api/progress/toggle`
- `GET /api/badges`
- `POST /api/badges/equip`
- `GET /api/profile/[username]`
- `PATCH /api/profile`
- `POST /api/admin/franchises`
- `PATCH /api/admin/franchises/[id]`
- `POST /api/admin/works`
- `POST /api/admin/seasons`
- `POST /api/admin/episodes`
- `POST /api/admin/anilist/search`
- `POST /api/admin/anilist/import`
- `GET /api/admin/users`
- `PATCH /api/admin/users/[id]`
- `POST /api/admin/badges/grant`
- `GET /api/admin/reports`
- `POST /api/test/reset` solo test.

## Criterio di semplicità

Le funzioni social sono limitate ad attività, profili pubblici/privati, report e moderazione. Gli algoritmi complessi di raccomandazione vengono rimandati; la versione 1.0 usa raccomandazioni spiegabili basate su generi e preferiti.

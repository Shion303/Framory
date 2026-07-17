# Framory 1.0

Framory è una piattaforma anime-first per catalogare franchise, tracciare episodi e valorizzare profili tramite badge. La gerarchia dati è controllata da Framory:

```text
Franchise -> Collection -> Work -> Season -> Episode
```

AniList viene usato per popolare automaticamente il catalogo quando Framory non trova franchise o quando una ricerca non produce risultati locali. Ogni risultato AniList viene importato come franchise semplice con opera, stagione e placeholder episodi; Framory resta la fonte della gerarchia completa dei franchise.

## Stack

- Next.js 16 App Router
- React 19
- TypeScript strict
- Tailwind CSS 4
- Prisma ORM
- PostgreSQL/Supabase in produzione
- Adapter file locale solo per sviluppo e test senza credenziali reali
- Vitest e Playwright

## Avvio locale

```bash
npm install
npm run prisma:generate
npm run dev
```

Il file `.env` locale usa `FRAMORY_STORAGE=file` per consentire prove senza un database Supabase. In produzione usare `FRAMORY_STORAGE=prisma` e un `DATABASE_URL` PostgreSQL valido.

L'import automatico AniList e' attivo di default. Per spegnerlo in test o ambienti senza rete:

```bash
FRAMORY_DISABLE_ANILIST_AUTO_IMPORT=1
```

## Controlli

```bash
npm run prisma:validate
npm run prisma:generate
npm run typecheck
npm run lint
npm run test
npm run build
npm run test:e2e
npm run check
```

## Seed owner

L'owner viene creato solo se sono presenti:

- `FRAMORY_OWNER_EMAIL`
- `FRAMORY_OWNER_USERNAME`
- `FRAMORY_OWNER_PASSWORD`
- `FRAMORY_OWNER_DISPLAY_NAME`

Non inserire credenziali reali nel repository.

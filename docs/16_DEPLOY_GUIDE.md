# Deploy Guide

## Variabili ambiente

Configurare in Vercel o ambiente equivalente:

```text
DATABASE_URL
FRAMORY_STORAGE=prisma
FRAMORY_APP_URL
FRAMORY_SESSION_SECRET
FRAMORY_OWNER_EMAIL
FRAMORY_OWNER_USERNAME
FRAMORY_OWNER_PASSWORD
FRAMORY_OWNER_DISPLAY_NAME
ANILIST_GRAPHQL_URL
FRAMORY_DISABLE_ANILIST_AUTO_IMPORT
FRAMORY_ANILIST_EPISODE_IMPORT_LIMIT
FRAMORY_ANILIST_RELATION_SYNC_INTERVAL_MS
```

Non usare i valori locali presenti in `.env.example` come segreti reali.

## Supabase

1. Creare un progetto Supabase PostgreSQL.
2. Copiare la connection string server-side in `DATABASE_URL`.
3. Eseguire:

```bash
npm ci
npm run prisma:deploy
npm run seed
npm run check
```

## Vercel

1. Collegare il repository.
2. Impostare le variabili ambiente.
3. Usare `vercel.json`.
4. Verificare `/api/health` dopo il deploy.

## Checklist

- Migration applicate.
- Owner generato da variabili ambiente.
- `/api/health` restituisce `ok: true`.
- Login owner verificato.
- Policy privacy e termini sostituite se il servizio è pubblico.
- Backup Supabase configurato.

# Implementation Report

## Architettura implementata

Framory 1.0 è implementato come applicazione Next.js 16 App Router con React 19, TypeScript strict, Tailwind CSS 4, Prisma 7 e PostgreSQL/Supabase come destinazione produzione. La persistenza usa un contratto `FramoryStore` con due adapter:

- `PrismaStore` per produzione PostgreSQL/Supabase;
- `FileStore` solo per sviluppo locale ed e2e senza credenziali reali.

La gerarchia anime è:

```text
Franchise -> Collection -> Work -> Season -> Episode
```

La libreria utente contiene una sola voce per franchise. Il progresso è calcolato dagli episodi verso franchise. AniList è limitato a ricerca e import di singole opere dentro un franchise scelto da Admin.

## Milestone completate

- Fondazioni Next, tema scuro, env, Prisma, CI e README.
- Autenticazione con bcrypt, sessioni, cookie `httpOnly`, ruoli e rate limit.
- Catalogo Admin manuale per franchise, collection, work, season, episode.
- Import AniList controllato.
- Discovery per franchise, libreria, tracking episodi e home con statistiche.
- Pagina franchise, profilo, privacy, badge, attività e moderazione base.
- Health check, deploy guide, maintenance guide e policy placeholder.

## File principali

- `src/app`: route, API e pagine.
- `src/components`: componenti client.
- `src/server`: autenticazione, sicurezza, store, AniList e progresso.
- `prisma/schema.prisma`: modello dati produzione.
- `tests` ed `e2e`: test unitari ed end-to-end.

## Modello dati

Il modello include utenti, sessioni, franchise, collection, work, season, episode, libreria, progresso episodio, badge, attività, segnalazioni, log admin e impostazioni piattaforma.

## API

Sono implementate API per auth, catalogo, admin, AniList, discovery, libreria, tracking, badge, profilo, report e health.

## Limiti noti

- I testi legali in `/privacy` e `/termini` sono placeholder chiaramente segnalati.
- Le raccomandazioni sono semplici e spiegabili, non algoritmiche.
- Le funzioni social sono limitate a profilo, attività, report e moderazione iniziale.
- Il deploy reale richiede credenziali Supabase/Vercel fornite dall'owner.

## Commit finale

Il commit hash finale deve essere letto con:

```bash
git rev-parse HEAD
```

Inserire il proprio hash dentro il contenuto del commit renderebbe il valore auto-referenziale e non stabile.

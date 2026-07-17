# Framory 1.0 - Specifica Completa

Framory è una piattaforma dedicata esclusivamente agli anime. L'esperienza deve coprire catalogo, discovery, libreria, tracking, profili, statistiche, attività, punteggi, preferiti e funzioni social introdotte progressivamente.

## Regole di prodotto

- Framory tratta solo anime.
- La libreria contiene una sola voce per ogni franchise e utente.
- AniList è una sorgente esterna di dati, non decide la gerarchia Framory.
- La gerarchia obbligatoria è `Franchise -> Collection -> Work -> Season -> Episode`.
- La `Collection` è facoltativa; ogni `Work` appartiene sempre a un `Franchise`.
- Il progresso si calcola dal basso verso l'alto.
- I badge sono collezionabili, sbloccabili, assegnabili, equipaggiabili e visibili sul profilo.
- Ogni utente può equipaggiare al massimo tre badge.

## Requisiti tecnici

- Next.js 16, React 19, TypeScript strict, Tailwind CSS 4.
- Prisma ORM con PostgreSQL/Supabase.
- AniList GraphQL API come assistente di catalogo.
- Autenticazione con cookie `httpOnly`, sessioni scadute e password bcrypt o Argon2id.
- Autorizzazioni server-side reali.
- UI in italiano, responsive, accessibile, tema scuro nero/zinc con accento viola.

## Milestone

Le milestone di riferimento sono fondazioni, autenticazione, catalogo admin, AniList controllato, discovery, libreria, tracking, pagina franchise, home, profilo/privacy, badge, attività/moderazione/admin finale, rifinitura, test end-to-end e deploy.

# Test Report

## Comandi verificati

- `npm run prisma:validate`
- `npm run prisma:generate`
- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run build`
- `npm run test:e2e`
- `npm run check`

## Copertura automatica

Vitest copre:

- calcolo del progresso dal basso verso l'alto;
- hashing password bcrypt;
- sessioni;
- flusso catalogo, libreria, tracking e badge sullo store locale;
- auto-import AniList idempotente nello store locale e coordinatore server con fetch mockato;
- privacy profilo;
- disattivazione account.

Playwright copre:

- login owner;
- creazione catalogo Admin via API autenticata;
- registrazione utente;
- discovery;
- aggiunta in libreria;
- tracking episodio;
- aggiornamento Home;
- sblocco ed equip badge;
- privacy profilo;
- autorizzazioni Admin;
- account disattivato.

## Note

Playwright usa un runner dedicato (`scripts/run-e2e.mjs`) per chiudere correttamente Next.js su Windows.
`npm audit --audit-level=moderate` risulta pulito dopo override mirati per dipendenze transitive di Next/Prisma.

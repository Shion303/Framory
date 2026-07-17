# Acceptance Criteria

## Fondazioni

- `npm run prisma:validate`, `npm run prisma:generate`, `npm run typecheck`, `npm run lint`, `npm run test` e `npm run build` terminano senza errori.
- La UI ha layout scuro, testi italiani, navigazione responsive e stati vuoti.

## Autenticazione

- Registrazione, login e logout funzionano.
- Le password sono salvate con bcrypt.
- I cookie sessione sono `httpOnly`.
- Gli account disattivati non possono accedere.
- Le API protette controllano ruolo e sessione lato server.

## Catalogo e Discovery

- L'admin può creare franchise, work, season ed episode senza toccare il database.
- La discovery mostra solo franchise, con ricerca, filtri e pagina dettaglio.
- AniList importa solo dati di una singola opera in un franchise scelto.

## Libreria e Tracking

- Ogni utente ha al massimo una voce libreria per franchise.
- L'utente può modificare stato, punteggio, preferito e note.
- Il progresso episodio aggiorna season, work, collection e franchise.
- La home mostra il prossimo episodio.

## Profilo, Badge e Admin

- Il profilo rispetta privacy.
- I badge possono essere assegnati, sbloccati ed equipaggiati con massimo tre slot.
- Admin/moderazione gestiscono utenti, report, log e manutenzione.

## Deploy

- Sono presenti `.env.example`, migration Prisma, guide deploy/manutenzione, health check e policy placeholder.

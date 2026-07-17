# Maintenance Guide

## Operazioni ricorrenti

- Eseguire `npm run check` prima di ogni release.
- Eseguire `npm audit --audit-level=moderate` e valutare gli aggiornamenti senza `--force` automatico.
- Applicare migration con `npm run prisma:deploy`.
- Verificare `/api/health`.

## Backup e ripristino

- Usare backup Supabase pianificati.
- Prima di migration importanti esportare un dump PostgreSQL.
- Ripristinare in staging prima di produzione.

## Sicurezza

- Ruoli owner/admin/moderator/user sono applicati lato server.
- Password con bcrypt.
- Cookie sessione `httpOnly`.
- Account disattivati non possono usare sessioni.
- Non committare `.env` o segreti.

## Manutenzione catalogo

- AniList va usato solo come assistente per opere singole.
- La gerarchia franchise resta controllata da Admin Framory.
- Non introdurre manga, novel o media non anime.

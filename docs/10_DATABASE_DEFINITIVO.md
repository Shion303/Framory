# Database Definitivo

## Entità principali

- `User`: account, ruolo, stato attivo, preferenze privacy e profilo.
- `Session`: token di sessione hashato, scadenza, cookie `httpOnly`.
- `Franchise`: contenitore principale visibile in discovery e libreria.
- `Collection`: raggruppamento opzionale dentro un franchise.
- `Work`: opera anime appartenente a un franchise, importabile da AniList.
- `Season`: stagione o arco dell'opera.
- `Episode`: unità minima di tracking.
- `LibraryEntry`: una sola voce utente-franchise.
- `EpisodeProgress`: avanzamento episodio per utente.
- `Badge`, `UserBadge`: catalogo, assegnazioni ed equipaggiamento massimo tre.
- `Activity`: attività utente e amministrative visibili secondo privacy.
- `Report`: segnalazioni per moderazione.
- `AdminLog`: audit log amministrativo.
- `PlatformSetting`: impostazioni come modalità manutenzione.

## Vincoli

- `User.email` e `User.username` unici.
- `Franchise.slug` unico.
- `Work.anilistId` unico quando presente.
- `LibraryEntry` unico su `userId, franchiseId`.
- `EpisodeProgress` unico su `userId, episodeId`.
- `UserBadge` unico su `userId, badgeId`.
- Massimo tre badge equipaggiati applicato lato server.

## Migrazioni

La migration iniziale crea enum, tabelle, relazioni, indici e vincoli. Le modifiche future devono essere additive o accompagnate da migrazioni reversibili e documentate.

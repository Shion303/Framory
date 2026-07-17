# API Contracts

Tutte le API restituiscono JSON. Gli errori usano:

```json
{ "error": "Messaggio in italiano" }
```

## Autenticazione

- `POST /api/auth/register`: `{ email, username, displayName, password }`
- `POST /api/auth/login`: `{ email, password }`
- `POST /api/auth/logout`: nessun body.
- `GET /api/me`: sessione corrente o `user: null`.

## Catalogo

- `GET /api/franchises?query=&genre=&year=&status=&sort=&page=`
- `GET /api/franchises/[slug]`
- `POST /api/admin/franchises`: owner/admin.
- `PATCH /api/admin/franchises/[id]`: owner/admin.
- `POST /api/admin/works`: owner/admin.
- `POST /api/admin/seasons`: owner/admin.
- `POST /api/admin/episodes`: owner/admin.

## Libreria e tracking

- `GET /api/library`
- `POST /api/library`: `{ franchiseId }`
- `PATCH /api/library/[franchiseId]`: `{ state, score, favorite, notes }`
- `DELETE /api/library/[franchiseId]`
- `POST /api/progress/toggle`: `{ episodeId, completed }`

## Badge, profili e admin finale

- `GET /api/badges`
- `POST /api/badges/equip`: `{ badgeId, slot }`
- `GET /api/profile/[username]`
- `PATCH /api/profile`
- `GET /api/admin/users`
- `PATCH /api/admin/users/[id]`
- `POST /api/admin/badges/grant`
- `GET /api/admin/reports`

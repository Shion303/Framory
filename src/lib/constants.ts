import type { AnimeStatus, BadgeCategory, BadgeRarity, LibraryState, PrivacyLevel, Role, WorkFormat } from "./types";

export const roles: Role[] = ["owner", "admin", "moderator", "user"];
export const adminRoles: Role[] = ["owner", "admin"];
export const moderationRoles: Role[] = ["owner", "admin", "moderator"];
export const libraryStates: LibraryState[] = ["pianificato", "in_visione", "completato", "in_pausa", "interrotto"];
export const animeStatuses: AnimeStatus[] = ["annunciato", "in_corso", "concluso", "in_pausa"];
export const workFormats: WorkFormat[] = ["tv", "film", "ova", "ona", "special"];
export const privacyLevels: PrivacyLevel[] = ["pubblico", "follower", "privato"];
export const badgeRarities: BadgeRarity[] = ["comune", "raro", "epico", "leggendario"];
export const badgeCategories: BadgeCategory[] = ["tracking", "collezione", "community", "admin"];

export const SESSION_COOKIE = "framory_session";

export const labels = {
  role: {
    owner: "Owner",
    admin: "Admin",
    moderator: "Moderatore",
    user: "Utente"
  },
  libraryState: {
    pianificato: "Pianificato",
    in_visione: "In visione",
    completato: "Completato",
    in_pausa: "In pausa",
    interrotto: "Interrotto"
  },
  animeStatus: {
    annunciato: "Annunciato",
    in_corso: "In corso",
    concluso: "Concluso",
    in_pausa: "In pausa"
  },
  workFormat: {
    tv: "TV",
    film: "Film",
    ova: "OVA",
    ona: "ONA",
    special: "Special"
  },
  privacy: {
    pubblico: "Pubblico",
    follower: "Follower",
    privato: "Privato"
  },
  rarity: {
    comune: "Comune",
    raro: "Raro",
    epico: "Epico",
    leggendario: "Leggendario"
  }
} as const;

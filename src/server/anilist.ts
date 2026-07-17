import { workSchema } from "@/lib/validation";
import type { z } from "zod";

type AniListMedia = {
  id: number;
  idMal?: number | null;
  type?: string | null;
  isAdult?: boolean | null;
  title?: {
    romaji?: string | null;
    english?: string | null;
    native?: string | null;
  };
  description?: string | null;
  coverImage?: { large?: string | null };
  bannerImage?: string | null;
  genres?: string[];
  seasonYear?: number | null;
  format?: string | null;
  status?: string | null;
  duration?: number | null;
  episodes?: number | null;
  relations?: {
    edges?: Array<{
      relationType?: string | null;
      node?: AniListMedia | null;
    } | null> | null;
  } | null;
};

export type AniListImportCandidate = {
  anilistId: number;
  malId: number | null;
  title: string;
  titleRomaji: string | null;
  titleEnglish: string | null;
  titleNative: string | null;
  description: string | null;
  coverImage: string | null;
  bannerImage: string | null;
  genres: string[];
  startYear: number | null;
  format: z.infer<typeof workSchema>["format"];
  status: z.infer<typeof workSchema>["status"];
  duration: number | null;
  episodeCount: number | null;
  relationIds?: number[];
  relatedMedia?: AniListImportCandidate[];
};

const formatMap: Record<string, z.infer<typeof workSchema>["format"]> = {
  TV: "tv",
  MOVIE: "film",
  OVA: "ova",
  ONA: "ona",
  SPECIAL: "special",
  TV_SHORT: "tv"
};

const statusMap: Record<string, z.infer<typeof workSchema>["status"]> = {
  FINISHED: "concluso",
  RELEASING: "in_corso",
  NOT_YET_RELEASED: "annunciato",
  CANCELLED: "in_pausa",
  HIATUS: "in_pausa"
};

const groupedRelationTypes = new Set([
  "ADAPTATION",
  "PREQUEL",
  "SEQUEL",
  "PARENT",
  "SIDE_STORY",
  "SUMMARY",
  "ALTERNATIVE",
  "SPIN_OFF",
  "SOURCE",
  "COMPILATION",
  "CONTAINS"
]);

function stripHtml(value?: string | null) {
  return value?.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim() ?? null;
}

const mediaCoreSelection = `
  id
  idMal
  type
  isAdult
  title { romaji english native }
  description
  coverImage { large }
  bannerImage
  genres
  seasonYear
  format
  status
  duration
  episodes
`;

const mediaSelection = `
  ${mediaCoreSelection}
  relations {
    edges {
      relationType
      node {
        ${mediaCoreSelection}
      }
    }
  }
`;

async function fetchAniListMedia(query: string, variables: Record<string, unknown>) {
  const endpoint = process.env.ANILIST_GRAPHQL_URL ?? "https://graphql.anilist.co";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        query,
        variables
      })
    });
    if (!response.ok) {
      throw new Error(`AniList non disponibile (${response.status}).`);
    }
    const payload = (await response.json()) as { data?: { Page?: { media?: AniListMedia[] } }; errors?: unknown[] };
    if (payload.errors?.length) {
      throw new Error("AniList ha restituito un errore.");
    }
    return (payload.data?.Page?.media ?? []).map((media) => mapAniListMedia(media));
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchAniListMediaById(id: number) {
  const endpoint = process.env.ANILIST_GRAPHQL_URL ?? "https://graphql.anilist.co";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        query: `
          query AnimeById($id: Int!) {
            Media(id: $id, type: ANIME) {
              ${mediaSelection}
            }
          }
        `,
        variables: { id }
      })
    });
    if (!response.ok) {
      throw new Error(`AniList non disponibile (${response.status}).`);
    }
    const payload = (await response.json()) as { data?: { Media?: AniListMedia | null }; errors?: unknown[] };
    if (payload.errors?.length) {
      throw new Error("AniList ha restituito un errore.");
    }
    return payload.data?.Media ? mapAniListMedia(payload.data.Media) : null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function searchAniList(query: string) {
  return fetchAniListMedia(
    `
      query SearchAnime($search: String!) {
        Page(page: 1, perPage: 25) {
          media(search: $search, type: ANIME, sort: SEARCH_MATCH, isAdult: false) {
            ${mediaSelection}
          }
        }
      }
    `,
    { search: query }
  );
}

export async function getTrendingAniList(limit = 12) {
  return fetchAniListMedia(
    `
      query TrendingAnime($perPage: Int!) {
        Page(page: 1, perPage: $perPage) {
          media(type: ANIME, sort: TRENDING_DESC, isAdult: false) {
            ${mediaSelection}
          }
        }
      }
    `,
    { perPage: Math.max(1, Math.min(50, limit)) }
  );
}

export async function getAniListFranchiseCandidates(anilistId: number) {
  const root = await fetchAniListMediaById(anilistId);
  return root ? [root, ...(root.relatedMedia ?? [])] : [];
}

function relatedAnime(media: AniListMedia) {
  return (
    media.relations?.edges
      ?.filter((edge) => edge?.node && edge.relationType && groupedRelationTypes.has(edge.relationType))
      .map((edge) => edge?.node)
      .filter((node): node is AniListMedia => Boolean(node && node.type === "ANIME" && !node.isAdult)) ?? []
  );
}

export function mapAniListMedia(media: AniListMedia, includeRelated = true): AniListImportCandidate {
  const relatedMedia = includeRelated ? relatedAnime(media).map((node) => mapAniListMedia(node, false)) : [];
  return {
    anilistId: media.id,
    malId: media.idMal ?? null,
    title: media.title?.romaji ?? media.title?.english ?? media.title?.native ?? `Anime ${media.id}`,
    titleRomaji: media.title?.romaji ?? null,
    titleEnglish: media.title?.english ?? null,
    titleNative: media.title?.native ?? null,
    description: stripHtml(media.description),
    coverImage: media.coverImage?.large ?? null,
    bannerImage: media.bannerImage ?? null,
    genres: media.genres ?? [],
    startYear: media.seasonYear ?? null,
    format: media.format ? (formatMap[media.format] ?? "tv") : "tv",
    status: media.status ? (statusMap[media.status] ?? "annunciato") : "annunciato",
    duration: media.duration ?? null,
    episodeCount: media.episodes ?? null,
    relationIds: relatedMedia.map((item) => item.anilistId),
    relatedMedia
  };
}

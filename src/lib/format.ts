export function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function clampScore(score: number | null | undefined) {
  if (score === null || score === undefined || Number.isNaN(score)) {
    return null;
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function nowIso() {
  return new Date().toISOString();
}

export function asArray(value: string | string[] | undefined) {
  if (!value) {
    return [];
  }
  const raw = Array.isArray(value) ? value.join(",") : value;
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

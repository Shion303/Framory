import { z } from "zod";
import { animeStatuses, badgeCategories, badgeConditionKinds, badgeRarities, libraryStates, privacyLevels, roles, workFormats } from "./constants";

export const registerSchema = z.object({
  email: z.string().email().max(160),
  username: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_]+$/, "Usa solo lettere, numeri e underscore"),
  displayName: z.string().min(2).max(80),
  password: z.string().min(10).max(200)
});

export const loginSchema = z.object({
  email: z.string().email().max(160),
  password: z.string().min(1).max(200)
});

export const franchiseSchema = z.object({
  title: z.string().min(2).max(160),
  description: z.string().min(10).max(4000),
  coverImage: z.string().url().optional().or(z.literal("")),
  bannerImage: z.string().url().optional().or(z.literal("")),
  genres: z.array(z.string().min(1).max(40)).max(20).default([]),
  startYear: z.number().int().min(1900).max(2100).nullable().optional(),
  status: z.enum(animeStatuses),
  isCompleteAdaptation: z.boolean().default(false)
});

export const collectionSchema = z.object({
  franchiseId: z.string().min(1),
  title: z.string().min(2).max(160),
  description: z.string().max(1000).optional().nullable(),
  sortOrder: z.number().int().min(0).max(10000).default(0)
});

export const workSchema = z.object({
  franchiseId: z.string().min(1),
  collectionId: z.string().optional().nullable(),
  title: z.string().min(2).max(160),
  titleRomaji: z.string().max(160).optional().nullable(),
  titleEnglish: z.string().max(160).optional().nullable(),
  titleNative: z.string().max(160).optional().nullable(),
  description: z.string().max(4000).optional().nullable(),
  coverImage: z.string().url().optional().nullable().or(z.literal("")),
  bannerImage: z.string().url().optional().nullable().or(z.literal("")),
  genres: z.array(z.string().min(1).max(40)).max(20).default([]),
  startYear: z.number().int().min(1900).max(2100).nullable().optional(),
  format: z.enum(workFormats),
  status: z.enum(animeStatuses),
  duration: z.number().int().min(1).max(1000).nullable().optional(),
  episodeCount: z.number().int().min(0).max(5000).nullable().optional(),
  anilistId: z.number().int().positive().nullable().optional(),
  malId: z.number().int().positive().nullable().optional(),
  sortOrder: z.number().int().min(0).max(10000).default(0)
});

export const seasonSchema = z.object({
  workId: z.string().min(1),
  title: z.string().min(1).max(160),
  sortOrder: z.number().int().min(0).max(10000).default(0),
  episodeCount: z.number().int().min(0).max(5000).nullable().optional()
});

export const episodeSchema = z.object({
  seasonId: z.string().min(1),
  title: z.string().min(1).max(180),
  number: z.number().int().min(1).max(10000),
  duration: z.number().int().min(1).max(1000).nullable().optional(),
  airedAt: z.string().datetime().nullable().optional()
});

export const libraryUpdateSchema = z.object({
  state: z.enum(libraryStates).optional(),
  score: z.number().int().min(0).max(100).nullable().optional(),
  favorite: z.boolean().optional(),
  notes: z.string().max(2000).nullable().optional()
});

export const profileUpdateSchema = z.object({
  displayName: z.string().min(2).max(80).optional(),
  avatarUrl: z.string().url().optional().nullable().or(z.literal("")),
  bannerUrl: z.string().url().optional().nullable().or(z.literal("")),
  bio: z.string().max(800).optional().nullable(),
  profilePrivacy: z.enum(privacyLevels).optional(),
  libraryPrivacy: z.enum(privacyLevels).optional(),
  progressPrivacy: z.enum(privacyLevels).optional(),
  activityPrivacy: z.enum(privacyLevels).optional()
});

export const userAdminUpdateSchema = z.object({
  role: z.enum(roles).optional(),
  isActive: z.boolean().optional()
});

const badgeBaseSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9-]+$/, "Usa solo lettere minuscole, numeri e trattini"),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().min(5).max(1000),
  imageUrl: z.string().url().optional().nullable().or(z.literal("")),
  rarity: z.enum(badgeRarities),
  category: z.enum(badgeCategories),
  conditionKind: z.enum(badgeConditionKinds),
  conditionValue: z.number().int().min(0).max(100000).nullable().optional(),
  ownerOnly: z.boolean().default(false)
});

export const badgeSchema = badgeBaseSchema
  .superRefine((input, ctx) => {
    if ((input.conditionKind === "episodes_watched" || input.conditionKind === "franchises_completed") && input.conditionValue == null) {
      ctx.addIssue({
        code: "custom",
        path: ["conditionValue"],
        message: "Inserisci una soglia per i badge automatici."
      });
    }
  });

export const badgeUpdateSchema = badgeBaseSchema.partial().superRefine((input, ctx) => {
  if ((input.conditionKind === "episodes_watched" || input.conditionKind === "franchises_completed") && input.conditionValue == null) {
    ctx.addIssue({
      code: "custom",
      path: ["conditionValue"],
      message: "Inserisci una soglia per i badge automatici."
    });
  }
});

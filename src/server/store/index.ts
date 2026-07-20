import { getStorageMode } from "@/server/env";
import { FileStore } from "./file-store";
import { PrismaStore } from "./prisma-store";
import type { FramoryStore } from "./types";

let store: FramoryStore | null = null;

export function getStore(): FramoryStore {
  if (!store) {
    store = getStorageMode() === "prisma" ? new PrismaStore() : new FileStore();
  }
  return store;
}

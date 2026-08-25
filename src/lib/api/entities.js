import { ENTITY_NAMES } from "@/lib/db/database";
import { createCollection } from "@/lib/api/collection";

export const entities = Object.fromEntries(
  ENTITY_NAMES.map((name) => [name, createCollection(name)])
);

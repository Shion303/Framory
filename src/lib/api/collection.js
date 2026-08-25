import { db } from "@/lib/db/database";

function matchesFilter(record, filter) {
  if (!filter || Object.keys(filter).length === 0) return true;
  return Object.entries(filter).every(([key, value]) => record[key] === value);
}

function sortRecords(records, sort) {
  if (!sort) return records;
  const desc = String(sort).startsWith("-");
  const field = desc ? String(sort).slice(1) : String(sort);
  return [...records].sort((a, b) => {
    const av = a[field] ?? "";
    const bv = b[field] ?? "";
    if (av < bv) return desc ? 1 : -1;
    if (av > bv) return desc ? -1 : 1;
    return 0;
  });
}

export function createCollection(tableName) {
  const table = () => db.table(tableName);

  return {
    async list(sort, limit) {
      let records = await table().toArray();
      records = sortRecords(records, sort);
      if (typeof limit === "number") records = records.slice(0, limit);
      return records;
    },

    async filter(query = {}) {
      const records = await table().toArray();
      return records.filter((record) => matchesFilter(record, query));
    },

    async get(id) {
      const record = await table().get(id);
      if (!record) {
        throw new Error(`Record not found in ${tableName}`);
      }
      return record;
    },

    async create(data) {
      const now = new Date().toISOString();
      const record = {
        ...data,
        id: crypto.randomUUID(),
        created_date: now,
        updated_date: now,
      };
      await table().add(record);
      return record;
    },

    async update(id, patch) {
      const existing = await table().get(id);
      if (!existing) {
        throw new Error(`Record not found in ${tableName}`);
      }
      const record = {
        ...existing,
        ...patch,
        id,
        updated_date: new Date().toISOString(),
      };
      await table().put(record);
      return record;
    },

    async delete(id) {
      await table().delete(id);
    },

    async bulkCreate(items) {
      const now = new Date().toISOString();
      const records = items.map((data) => ({
        ...data,
        id: crypto.randomUUID(),
        created_date: now,
        updated_date: now,
      }));
      await table().bulkAdd(records);
      return records;
    },

    async deleteMany(query = {}) {
      if (!query || Object.keys(query).length === 0) {
        await table().clear();
        return;
      }
      const records = await table().toArray();
      const ids = records.filter((record) => matchesFilter(record, query)).map((record) => record.id);
      await table().bulkDelete(ids);
    },
  };
}

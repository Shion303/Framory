import { supabase } from "@/lib/supabase";

const TABLE_MAP = {
  Content: "content",
  Season: "season",
  Episode: "episode",
  EpisodeProgress: "episode_progress",
  LibraryItem: "library_item",
  Franchise: "franchise",
  FranchiseContent: "franchise_content",
  Trophy: "trophy",
  SyncStatus: "sync_status",
  MergeHistory: "merge_history",
};

function getTableName(entityName) {
  const tableName = TABLE_MAP[entityName];

  if (!tableName) {
    throw new Error(`Unknown Framory entity: ${entityName}`);
  }

  return tableName;
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

export function createCollection(entityName) {
  const tableName = getTableName(entityName);
  const hasUpdatedDate =
    entityName === "Content" ||
    entityName === "LibraryItem";

  return {
    async list(sort, limit) {
      let query = supabase.from(tableName).select("*");

      if (sort) {
        const desc = String(sort).startsWith("-");
        const field = desc ? String(sort).slice(1) : String(sort);

        query = query.order(field, {
          ascending: !desc,
        });
      }

      if (typeof limit === "number") {
        query = query.limit(limit);
      }

      const { data, error } = await query;

      if (error) throw error;

      return sort ? data : sortRecords(data || [], sort);
    },

    async filter(query = {}) {
      let request = supabase.from(tableName).select("*");

      for (const [key, value] of Object.entries(query)) {
        request = request.eq(key, value);
      }

      const { data, error } = await request;

      if (error) throw error;

      return data || [];
    },

    async get(id) {
      const { data, error } = await supabase
        .from(tableName)
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        throw new Error(`Record not found in ${entityName}`);
      }

      return data;
    },

    async create(data) {
      const now = new Date().toISOString();

      const record = {
        ...data,
        id: data.id || crypto.randomUUID(),
        created_date: data.created_date || now,
      };

      if (hasUpdatedDate) {
        record.updated_date = data.updated_date || now;
      }

      const { data: created, error } = await supabase
        .from(tableName)
        .insert(record)
        .select()
        .single();

      if (error) throw error;

      return created;
    },

    async update(id, patch) {
      const record = {
        ...patch,
      };

      if (hasUpdatedDate) {
        record.updated_date = new Date().toISOString();
      }

      const { data, error } = await supabase
        .from(tableName)
        .update(record)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      return data;
    },

    async delete(id) {
      const { error } = await supabase
        .from(tableName)
        .delete()
        .eq("id", id);

      if (error) throw error;
    },

    async bulkCreate(items) {
      if (!items || items.length === 0) return [];

      const now = new Date().toISOString();

      const records = items.map((data) => {
        const record = {
          ...data,
          id: data.id || crypto.randomUUID(),
          created_date: data.created_date || now,
        };

        if (hasUpdatedDate) {
          record.updated_date = data.updated_date || now;
        }

        return record;
      });

      const { data, error } = await supabase
        .from(tableName)
        .insert(records)
        .select();

      if (error) throw error;

      return data || [];
    },

    async deleteMany(query = {}) {
      let request = supabase.from(tableName).delete();

      if (Object.keys(query).length === 0) {
        request = request.not("id", "is", null);
      } else {
        for (const [key, value] of Object.entries(query)) {
          request = request.eq(key, value);
        }
      }

      const { error } = await request;

      if (error) throw error;
    },
  };
}
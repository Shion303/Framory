import { useEffect, useState, useCallback } from "react";
import { entities } from "@/lib/api";
import {
  loadLibraryItems,
  loadAllSeasonsGrouped,
  loadAllProgressGrouped,
  contentProgress,
} from "@/lib/tracking";

// Loads library items + grouped seasons/progress + computed progress map.
export function useLibraryData() {
  const [library, setLibrary] = useState([]);
  const [seasonsByContent, setSeasonsByContent] = useState({});
  const [progressByContent, setProgressByContent] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await loadLibraryItems();
      const seasons = await loadAllSeasonsGrouped(items);
      const progress = await loadAllProgressGrouped(items);
      setLibrary(items);
      setSeasonsByContent(seasons);
      setProgressByContent(progress);
    } catch (e) {
      setError(e.message || "Failed to load library");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const progressMap = {};
  library.forEach((item) => {
    const cp = contentProgress(seasonsByContent[item.content_id] || [], progressByContent[item.content_id] || []);
    progressMap[item.content_id] = cp;
  });

  return { library, setLibrary, seasonsByContent, progressByContent, progressMap, loading, error, reload: load };
}

export function useTrophies() {
  const [trophies, setTrophies] = useState([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await entities.Trophy.list("-created_date", 500);
      setTrophies(list);
    } catch (e) {
      setTrophies([]);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  return { trophies, setTrophies, loading, reload: load };
}

export function useFranchises() {
  const [franchises, setFranchises] = useState([]);
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [f, l] = await Promise.all([
        entities.Franchise.list("-created_date", 200),
        entities.FranchiseContent.list("-created_date", 1000),
      ]);
      setFranchises(f);
      setLinks(l);
    } catch (e) {
      setFranchises([]);
      setLinks([]);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  return { franchises, links, loading, reload: load };
}
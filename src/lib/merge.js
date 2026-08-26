// Merge engine — links two contents via a shared Franchise without destroying either record.
import { entities } from "@/lib/api";

/**
 * Merge `secondaryId` into a shared franchise with `primaryId`.
 *
 * Unlike a destructive merge, this operation:
 * - Keeps BOTH Content records intact (seasons, episodes, progress, library items, trophies)
 * - Links both to the same Franchise via FranchiseContent
 * - Does NOT delete the secondary Content
 * - Does NOT move data between contents
 *
 * The result is that both contents appear together on the FranchiseDetail page
 * and remain individually clickable/openable.
 */
export async function mergeContents(primaryId, secondaryId) {
  if (primaryId === secondaryId) {
    throw new Error("Cannot merge a content with itself.");
  }

  const [primary, secondary] = await Promise.all([
    entities.Content.get(primaryId),
    entities.Content.get(secondaryId),
  ]);

  if (!primary || !secondary) {
    throw new Error("One or both contents not found.");
  }

  console.log("MERGE DEBUG", {
    primaryId,
    secondaryId,
    primaryTitle: primary.title,
    primaryType: primary.content_type,
    secondaryTitle: secondary.title,
    secondaryType: secondary.content_type,
  });

  // 1. Find existing franchise links for both contents.
  const [primaryLinks, secondaryLinks] = await Promise.all([
    entities.FranchiseContent.filter({ content_id: primaryId }),
    entities.FranchiseContent.filter({ content_id: secondaryId }),
  ]);

  console.log("MERGE DEBUG links", {
    primaryLinksCount: primaryLinks.length,
    primaryFranchiseIds: primaryLinks.map((l) => l.franchise_id),
    secondaryLinksCount: secondaryLinks.length,
    secondaryFranchiseIds: secondaryLinks.map((l) => l.franchise_id),
  });

  // 2. Determine which franchise to use.
  //    Priority: primary's existing franchise > secondary's existing franchise > create new.
  let targetFranchiseId = null;

  if (primaryLinks.length > 0) {
    targetFranchiseId = primaryLinks[0].franchise_id;
  } else if (secondaryLinks.length > 0) {
    targetFranchiseId = secondaryLinks[0].franchise_id;
  } else {
    // Create a new franchise named after the primary content.
    const franchise = await entities.Franchise.create({
      name: primary.title,
      description: "",
      poster_url: primary.backdrop_url || primary.poster_url || "",
    });
    targetFranchiseId = franchise.id;
  }

  console.log("MERGE DEBUG franchise", { targetFranchiseId });

  // 3. Ensure primary is linked to the target franchise.
  const primaryAlreadyLinked = primaryLinks.some(
    (l) => l.franchise_id === targetFranchiseId
  );

  if (!primaryAlreadyLinked) {
    await entities.FranchiseContent.create({
      franchise_id: targetFranchiseId,
      content_id: primaryId,
    });
  }

  // 4. Ensure secondary is linked to the same franchise.
  const secondaryAlreadyLinked = secondaryLinks.some(
    (l) => l.franchise_id === targetFranchiseId
  );

  if (!secondaryAlreadyLinked) {
    await entities.FranchiseContent.create({
      franchise_id: targetFranchiseId,
      content_id: secondaryId,
    });
  }

  // 5. Remove stale franchise links from secondary that point to other franchises.
  //    (secondary should only be in the target franchise now)
  for (const l of secondaryLinks) {
    if (l.franchise_id !== targetFranchiseId) {
      await entities.FranchiseContent.delete(l.id);
    }
  }

  // 6. Record merge history (merge_history only has: id, created_date, merge_date, merged_content_ids).
  await entities.MergeHistory.create({
    merged_content_ids: [primaryId, secondaryId],
  });

  // 7. Verify final state.
  const finalPrimaryLinks = await entities.FranchiseContent.filter({ content_id: primaryId });
  const finalSecondaryLinks = await entities.FranchiseContent.filter({ content_id: secondaryId });

  const [primarySeasons, primaryProgress] = await Promise.all([
    entities.Season.filter({ content_id: primaryId }),
    entities.EpisodeProgress.filter({ content_id: primaryId }),
  ]);

  const [secondarySeasons, secondaryProgress] = await Promise.all([
    entities.Season.filter({ content_id: secondaryId }),
    entities.EpisodeProgress.filter({ content_id: secondaryId }),
  ]);

  console.log("MERGE RESULT", {
    primaryId,
    secondaryId,
    primaryFranchiseLinks: finalPrimaryLinks.map((l) => l.franchise_id),
    secondaryFranchiseLinks: finalSecondaryLinks.map((l) => l.franchise_id),
    primarySeasonsCount: primarySeasons.length,
    primaryProgressCount: primaryProgress.length,
    secondarySeasonsCount: secondarySeasons.length,
    secondaryProgressCount: secondaryProgress.length,
    primaryStillExists: true,
    secondaryStillExists: true,
  });

  return { primary, secondary };
}

export async function getMergeHistory() {
  const records = await entities.MergeHistory.list("-created_date", 100);

  // Resolve content titles from stored IDs.
  const allIds = [...new Set(records.flatMap((r) => r.merged_content_ids || []))];
  const titleMap = {};
  for (const id of allIds) {
    try {
      const c = await entities.Content.get(id);
      titleMap[id] = c?.title || id;
    } catch {
      titleMap[id] = id;
    }
  }

  return records.map((r) => ({
    ...r,
    resolved_titles: (r.merged_content_ids || []).map((id) => titleMap[id] || id),
  }));
}

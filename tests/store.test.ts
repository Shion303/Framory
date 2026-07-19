import { rm } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ensureAniListCatalog } from "@/server/auto-import";
import { getStore } from "@/server/store";
import { FileStore } from "@/server/store/file-store";
import { hashPassword, verifyPassword } from "@/server/security";
import type { AniListImportCandidate } from "@/server/anilist";

const dataFile = ".framory/unit-data.json";

async function freshStore() {
  process.env.FRAMORY_ALLOW_TEST_RESET = "1";
  process.env.FRAMORY_DATA_FILE = dataFile;
  process.env.FRAMORY_OWNER_EMAIL = "owner-unit@framory.test";
  process.env.FRAMORY_OWNER_USERNAME = "ownerunit";
  process.env.FRAMORY_OWNER_PASSWORD = "OwnerPassword123!";
  process.env.FRAMORY_OWNER_DISPLAY_NAME = "Owner Unit";
  await rm(dataFile, { force: true });
  const store = new FileStore(dataFile);
  await store.ensureReady();
  return store;
}

describe("FileStore", () => {
  beforeEach(async () => {
    await rm(dataFile, { force: true });
  });

  it("usa password bcrypt e sessioni attive", async () => {
    const store = await freshStore();
    const passwordHash = await hashPassword("PasswordSicura123!");
    expect(passwordHash).not.toContain("PasswordSicura123!");
    expect(await verifyPassword("PasswordSicura123!", passwordHash)).toBe(true);
    const user = await store.createUser({
      email: "utente@framory.test",
      username: "utente",
      displayName: "Utente",
      passwordHash
    });
    const session = await store.createSession(user.id);
    await expect(store.getUserBySessionToken(session.token)).resolves.toMatchObject({ id: user.id });
  });

  it("completa il flusso catalogo, libreria, tracking e badge", async () => {
    const store = await freshStore();
    const owner = await store.getUserByEmail("owner-unit@framory.test");
    const user = await store.createUser({
      email: "viewer@framory.test",
      username: "viewer",
      displayName: "Viewer",
      passwordHash: await hashPassword("PasswordSicura123!")
    });
    const franchise = await store.createFranchise(
      {
        title: "Frieren",
        description: "Un franchise anime fantasy con tracking per episodi.",
        coverImage: "",
        bannerImage: "",
        genres: ["Fantasy", "Avventura"],
        startYear: 2023,
        status: "concluso",
        isCompleteAdaptation: false
      },
      owner!.id
    );
    const withWork = await store.createWork(
      {
        franchiseId: franchise.id,
        collectionId: null,
        title: "Serie principale",
        titleRomaji: null,
        titleEnglish: null,
        titleNative: null,
        description: null,
        coverImage: null,
        bannerImage: null,
        genres: ["Fantasy"],
        startYear: 2023,
        format: "tv",
        status: "concluso",
        duration: 24,
        episodeCount: 1,
        anilistId: null,
        malId: null,
        sortOrder: 0
      },
      owner!.id
    );
    const withSeason = await store.createSeason(
      {
        workId: withWork.works[0].id,
        title: "Stagione 1",
        sortOrder: 0,
        episodeCount: 1
      },
      owner!.id
    );
    const complete = await store.createEpisode(
      {
        seasonId: withSeason.works[0].seasons[0].id,
        title: "La fine del viaggio",
        number: 1,
        duration: 24,
        airedAt: null
      },
      owner!.id
    );

    await store.addToLibrary(user.id, franchise.id);
    const entry = await store.toggleEpisode(user.id, complete.works[0].seasons[0].episodes[0].id, true);
    expect(entry.progress?.percentage).toBe(100);
    expect(entry.state).toBe("completato");

    const badges = await store.listBadges(user.id);
    const firstEpisode = badges.userBadges.find((badge) => badge.badge.slug === "primo-episodio");
    expect(firstEpisode).toBeTruthy();
    const equipped = await store.equipBadge(user.id, firstEpisode!.badgeId, 1);
    expect(equipped.find((badge) => badge.badgeId === firstEpisode!.badgeId)?.equippedSlot).toBe(1);
  });

  it("gestisce creazione, modifica, assegnazione ed eliminazione badge admin", async () => {
    const store = await freshStore();
    const owner = await store.getUserByEmail("owner-unit@framory.test");
    const user = await store.createUser({
      email: "badge-user@framory.test",
      username: "badgeuser",
      displayName: "Badge User",
      passwordHash: await hashPassword("PasswordSicura123!")
    });

    const badge = await store.createBadge(owner!.id, {
      slug: "badge-test",
      name: "Badge Test",
      description: "Badge creato dal pannello admin.",
      imageUrl: "https://example.com/badge-test.png",
      rarity: "raro",
      category: "admin",
      conditionKind: "manual",
      conditionValue: null,
      ownerOnly: false
    });
    expect((await store.listBadges()).badges.find((item) => item.slug === "badge-test")).toBeTruthy();

    const updated = await store.updateBadge(owner!.id, badge.id, {
      slug: "badge-test-editato",
      name: "Badge Test Editato",
      description: "Badge aggiornato dal pannello admin.",
      imageUrl: "https://example.com/badge-test-editato.png",
      rarity: "epico",
      category: "community",
      conditionKind: "admin_created",
      conditionValue: null,
      ownerOnly: false
    });
    expect(updated).toMatchObject({ slug: "badge-test-editato", imageUrl: "https://example.com/badge-test-editato.png", rarity: "epico", category: "community" });

    await store.grantBadge(owner!.id, user.id, badge.id);
    expect((await store.listBadges(user.id)).userBadges.find((item) => item.badge.name === "Badge Test Editato")).toBeTruthy();

    await store.deleteBadge(owner!.id, badge.id);
    const badges = await store.listBadges(user.id);
    expect(badges.badges.find((item) => item.id === badge.id)).toBeUndefined();
    expect(badges.userBadges.find((item) => item.badgeId === badge.id)).toBeUndefined();
  });

  it("impedisce ai non-owner di ottenere badge riservati all'owner", async () => {
    const store = await freshStore();
    const owner = await store.getUserByEmail("owner-unit@framory.test");
    const user = await store.createUser({
      email: "standard@framory.test",
      username: "standard",
      displayName: "Standard",
      passwordHash: await hashPassword("PasswordSicura123!")
    });
    const badge = await store.createBadge(owner!.id, {
      slug: "owner-unico",
      name: "Owner Unico",
      description: "Badge riservato soltanto all'account owner.",
      imageUrl: "https://example.com/owner.png",
      rarity: "leggendario",
      category: "admin",
      conditionKind: "manual",
      conditionValue: null,
      ownerOnly: true
    });

    await expect(store.grantBadge(owner!.id, user.id, badge.id)).rejects.toThrow("owner");
    await expect(store.grantBadge(owner!.id, owner!.id, badge.id)).resolves.toMatchObject({ userId: owner!.id, badgeId: badge.id });
  });

  it("importa automaticamente franchise AniList senza duplicati", async () => {
    const store = await freshStore();
    const sequel: AniListImportCandidate = {
      anilistId: 200001,
      malId: null,
      title: "Dungeon Meshi OVA",
      titleRomaji: "Dungeon Meshi OVA",
      titleEnglish: null,
      titleNative: null,
      description: "Episodio speciale collegato.",
      coverImage: null,
      bannerImage: null,
      genres: ["Fantasy"],
      startYear: 2025,
      format: "ova",
      status: "annunciato",
      duration: 24,
      episodeCount: 1
    };
    const candidate: AniListImportCandidate = {
      anilistId: 170942,
      malId: 58514,
      title: "Dungeon Meshi",
      titleRomaji: "Dungeon Meshi",
      titleEnglish: "Delicious in Dungeon",
      titleNative: null,
      description: "Un party fantasy esplora dungeon e cucina mostri.",
      coverImage: null,
      bannerImage: null,
      genres: ["Fantasy", "Avventura"],
      startYear: 2024,
      format: "tv",
      status: "concluso",
      duration: 24,
      episodeCount: 3,
      relationIds: [sequel.anilistId],
      relatedMedia: [sequel]
    };

    const imported = await store.autoImportAniListFranchises([candidate], { episodeCap: 2 });
    expect(imported).toHaveLength(1);
    expect(imported[0]).toMatchObject({ title: "Dungeon Meshi", slug: "dungeon-meshi" });
    expect(imported[0].collections[0]).toMatchObject({ title: "Opere collegate AniList" });
    expect(imported[0].works).toHaveLength(2);
    expect(imported[0].works[0]).toMatchObject({ anilistId: 170942, titleEnglish: "Delicious in Dungeon" });
    expect(imported[0].works[0].seasons[0].episodes).toHaveLength(2);

    const duplicate = await store.autoImportAniListFranchises([candidate]);
    expect(duplicate).toHaveLength(1);
    await expect(store.listFranchises({ query: "Dungeon" })).resolves.toMatchObject({ total: 1 });
    await expect(store.listFranchises({ query: "Delicious" })).resolves.toMatchObject({ total: 1 });
  });

  it("fonde franchise AniList compatibili per titolo e relazioni", async () => {
    const store = await freshStore();
    const first: AniListImportCandidate = {
      anilistId: 1,
      malId: null,
      title: "Serie Base",
      titleRomaji: "Serie Base",
      titleEnglish: null,
      titleNative: null,
      description: "Prima opera.",
      coverImage: null,
      bannerImage: null,
      genres: ["Azione"],
      startYear: 2020,
      format: "tv",
      status: "concluso",
      duration: 24,
      episodeCount: 1
    };
    const second: AniListImportCandidate = {
      anilistId: 2,
      malId: null,
      title: "Serie Base 2",
      titleRomaji: "Serie Base 2",
      titleEnglish: null,
      titleNative: null,
      description: "Seconda opera.",
      coverImage: null,
      bannerImage: null,
      genres: ["Azione"],
      startYear: 2021,
      format: "tv",
      status: "concluso",
      duration: 24,
      episodeCount: 1
    };

    await store.autoImportAniListFranchises([first]);
    await store.autoImportAniListFranchises([second]);
    await expect(store.listFranchises()).resolves.toMatchObject({ total: 1 });

    const merged = await store.autoImportAniListFranchises([{ ...first, relationIds: [second.anilistId], relatedMedia: [second] }]);
    expect(merged).toHaveLength(1);
    expect(merged[0].works.map((work) => work.anilistId).sort()).toEqual([1, 2]);
    expect(merged[0].collections).toHaveLength(1);
    await expect(store.listFranchises()).resolves.toMatchObject({ total: 1 });
  });

  it("trova Dr Stone come un solo risultato anche con punteggiatura diversa", async () => {
    const store = await freshStore();
    const first: AniListImportCandidate = {
      anilistId: 105333,
      malId: null,
      title: "Dr. STONE",
      titleRomaji: "Dr. STONE",
      titleEnglish: "Dr. STONE",
      titleNative: null,
      description: "Prima stagione.",
      coverImage: null,
      bannerImage: null,
      genres: ["Avventura"],
      startYear: 2019,
      format: "tv",
      status: "concluso",
      duration: 24,
      episodeCount: 1
    };
    const second: AniListImportCandidate = {
      anilistId: 113936,
      malId: null,
      title: "Dr. STONE: Stone Wars",
      titleRomaji: "Dr. STONE: Stone Wars",
      titleEnglish: "Dr. STONE: Stone Wars",
      titleNative: null,
      description: "Seconda stagione.",
      coverImage: null,
      bannerImage: null,
      genres: ["Avventura"],
      startYear: 2021,
      format: "tv",
      status: "concluso",
      duration: 24,
      episodeCount: 1
    };

    await store.autoImportAniListFranchises([first]);
    await store.autoImportAniListFranchises([second]);
    await expect(store.listFranchises({ query: "DR.STONE" })).resolves.toMatchObject({ total: 1 });

    await store.autoImportAniListFranchises([{ ...first, relationIds: [second.anilistId], relatedMedia: [second] }]);
    const result = await store.listFranchises({ query: "DR.STONE" });
    expect(result.total).toBe(1);
    expect(result.items[0].works.map((work) => work.title)).toEqual(["Dr. STONE", "Dr. STONE: Stone Wars"]);
  });

  it("semina il catalogo vuoto tramite AniList automatico", async () => {
    const originalFetch = globalThis.fetch;
    const previousDisable = process.env.FRAMORY_DISABLE_ANILIST_AUTO_IMPORT;
    const previousStorage = process.env.FRAMORY_STORAGE;
    const previousDataFile = process.env.FRAMORY_DATA_FILE;
    const previousAllowReset = process.env.FRAMORY_ALLOW_TEST_RESET;
    process.env.FRAMORY_STORAGE = "file";
    process.env.FRAMORY_DISABLE_ANILIST_AUTO_IMPORT = "0";
    process.env.FRAMORY_DATA_FILE = dataFile;
    process.env.FRAMORY_ALLOW_TEST_RESET = "1";
    await getStore().resetForTests();

    globalThis.fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          data: {
            Page: {
              media: [
                {
                  id: 21,
                  idMal: 21,
                  title: { romaji: "One Piece", english: "One Piece", native: null },
                  description: "Avventura piratesca.",
                  coverImage: { large: null },
                  bannerImage: null,
                  genres: ["Adventure"],
                  seasonYear: 1999,
                  format: "TV",
                  status: "RELEASING",
                  duration: 24,
                  episodes: 2
                }
              ]
            }
          }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    try {
      await expect(ensureAniListCatalog()).resolves.toMatchObject({ attempted: true, imported: 1 });
      await expect(getStore().listFranchises({ query: "One Piece" })).resolves.toMatchObject({ total: 1 });
    } finally {
      globalThis.fetch = originalFetch;
      if (previousDisable === undefined) {
        delete process.env.FRAMORY_DISABLE_ANILIST_AUTO_IMPORT;
      } else {
        process.env.FRAMORY_DISABLE_ANILIST_AUTO_IMPORT = previousDisable;
      }
      if (previousStorage === undefined) {
        delete process.env.FRAMORY_STORAGE;
      } else {
        process.env.FRAMORY_STORAGE = previousStorage;
      }
      if (previousDataFile === undefined) {
        delete process.env.FRAMORY_DATA_FILE;
      } else {
        process.env.FRAMORY_DATA_FILE = previousDataFile;
      }
      if (previousAllowReset === undefined) {
        delete process.env.FRAMORY_ALLOW_TEST_RESET;
      } else {
        process.env.FRAMORY_ALLOW_TEST_RESET = previousAllowReset;
      }
    }
  });

  it("sincronizza la query AniList prima di lasciare risultati duplicati", async () => {
    const originalFetch = globalThis.fetch;
    const previousDisable = process.env.FRAMORY_DISABLE_ANILIST_AUTO_IMPORT;
    const previousStorage = process.env.FRAMORY_STORAGE;
    const previousDataFile = process.env.FRAMORY_DATA_FILE;
    const previousAllowReset = process.env.FRAMORY_ALLOW_TEST_RESET;
    process.env.FRAMORY_STORAGE = "file";
    process.env.FRAMORY_DISABLE_ANILIST_AUTO_IMPORT = "0";
    process.env.FRAMORY_DATA_FILE = dataFile;
    process.env.FRAMORY_ALLOW_TEST_RESET = "1";
    await getStore().resetForTests();

    const first: AniListImportCandidate = {
      anilistId: 305333,
      malId: null,
      title: "Dr. STONE",
      titleRomaji: "Dr. STONE",
      titleEnglish: "Dr. STONE",
      titleNative: null,
      description: "Prima stagione.",
      coverImage: null,
      bannerImage: null,
      genres: ["Avventura"],
      startYear: 2019,
      format: "tv",
      status: "concluso",
      duration: 24,
      episodeCount: 1
    };
    const second: AniListImportCandidate = {
      anilistId: 313936,
      malId: null,
      title: "Dr. STONE: Stone Wars",
      titleRomaji: "Dr. STONE: Stone Wars",
      titleEnglish: "Dr. STONE: Stone Wars",
      titleNative: null,
      description: "Seconda stagione.",
      coverImage: null,
      bannerImage: null,
      genres: ["Avventura"],
      startYear: 2021,
      format: "tv",
      status: "concluso",
      duration: 24,
      episodeCount: 1
    };
    await getStore().autoImportAniListFranchises([first]);
    await getStore().autoImportAniListFranchises([second]);

    globalThis.fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          data: {
            Page: {
              media: [
                {
                  id: first.anilistId,
                  idMal: null,
                  type: "ANIME",
                  isAdult: false,
                  title: { romaji: first.titleRomaji, english: first.titleEnglish, native: null },
                  description: first.description,
                  coverImage: { large: null },
                  bannerImage: null,
                  genres: first.genres,
                  seasonYear: first.startYear,
                  format: "TV",
                  status: "FINISHED",
                  duration: first.duration,
                  episodes: first.episodeCount,
                  relations: {
                    edges: [
                      {
                        relationType: "SEQUEL",
                        node: {
                          id: second.anilistId,
                          idMal: null,
                          type: "ANIME",
                          isAdult: false,
                          title: { romaji: second.titleRomaji, english: second.titleEnglish, native: null },
                          description: second.description,
                          coverImage: { large: null },
                          bannerImage: null,
                          genres: second.genres,
                          seasonYear: second.startYear,
                          format: "TV",
                          status: "FINISHED",
                          duration: second.duration,
                          episodes: second.episodeCount
                        }
                      }
                    ]
                  }
                }
              ]
            }
          }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    try {
      await expect(ensureAniListCatalog({ query: "DR.STONE" })).resolves.toMatchObject({ attempted: true, imported: 1 });
      await expect(getStore().listFranchises({ query: "DR.STONE" })).resolves.toMatchObject({ total: 1 });
    } finally {
      globalThis.fetch = originalFetch;
      if (previousDisable === undefined) {
        delete process.env.FRAMORY_DISABLE_ANILIST_AUTO_IMPORT;
      } else {
        process.env.FRAMORY_DISABLE_ANILIST_AUTO_IMPORT = previousDisable;
      }
      if (previousStorage === undefined) {
        delete process.env.FRAMORY_STORAGE;
      } else {
        process.env.FRAMORY_STORAGE = previousStorage;
      }
      if (previousDataFile === undefined) {
        delete process.env.FRAMORY_DATA_FILE;
      } else {
        process.env.FRAMORY_DATA_FILE = previousDataFile;
      }
      if (previousAllowReset === undefined) {
        delete process.env.FRAMORY_ALLOW_TEST_RESET;
      } else {
        process.env.FRAMORY_ALLOW_TEST_RESET = previousAllowReset;
      }
    }
  });

  it("applica privacy e disattivazione account lato server", async () => {
    const store = await freshStore();
    const owner = await store.getUserByEmail("owner-unit@framory.test");
    const user = await store.createUser({
      email: "privato@framory.test",
      username: "privato",
      displayName: "Privato",
      passwordHash: await hashPassword("PasswordSicura123!")
    });
    await store.updateProfile(user.id, { profilePrivacy: "privato", libraryPrivacy: "privato", activityPrivacy: "privato" });
    const publicProfile = await store.getPublicProfile("privato");
    expect(publicProfile?.library).toHaveLength(0);
    await store.updateUser(owner!.id, user.id, { isActive: false });
    const deactivated = await store.getPublicProfile("privato");
    expect(deactivated).toBeNull();
  });
});

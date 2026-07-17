import { rm } from "node:fs/promises";
import { beforeEach, describe, expect, it } from "vitest";
import { FileStore } from "@/server/store/file-store";
import { hashPassword, verifyPassword } from "@/server/security";

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

import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  await request.post("/api/test/reset");
});

test("flusso principale Framory 1.0", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("owner@framory.test");
  await page.getByLabel("Password").fill("OwnerPassword123!");
  await page.getByRole("button", { name: /Entra/ }).click();
  await expect(page.getByText("Bentornato, Owner Framory")).toBeVisible();

  const franchiseResponse = await page.request.post("/api/admin/franchises", {
    data: {
      title: "E2E Anime",
      description: "Franchise anime creato dal test end-to-end.",
      genres: ["Fantasy", "Azione"],
      startYear: 2026,
      status: "in_corso",
      isCompleteAdaptation: false
    }
  });
  expect(franchiseResponse.ok()).toBe(true);
  const { franchise } = await franchiseResponse.json();
  const workResponse = await page.request.post("/api/admin/works", {
    data: {
      franchiseId: franchise.id,
      collectionId: null,
      title: "Serie principale",
      titleRomaji: null,
      titleEnglish: null,
      titleNative: null,
      description: "Opera principale.",
      coverImage: null,
      bannerImage: null,
      genres: ["Fantasy"],
      startYear: 2026,
      format: "tv",
      status: "in_corso",
      duration: 24,
      episodeCount: 1,
      anilistId: null,
      malId: null,
      sortOrder: 0
    }
  });
  expect(workResponse.ok()).toBe(true);
  const withWork = await workResponse.json();
  const seasonResponse = await page.request.post("/api/admin/seasons", {
    data: {
      workId: withWork.franchise.works[0].id,
      title: "Stagione 1",
      sortOrder: 0,
      episodeCount: 1
    }
  });
  expect(seasonResponse.ok()).toBe(true);
  const withSeason = await seasonResponse.json();
  const episodeResponse = await page.request.post("/api/admin/episodes", {
    data: {
      seasonId: withSeason.franchise.works[0].seasons[0].id,
      title: "Primo passo",
      number: 1,
      duration: 24,
      airedAt: null
    }
  });
  expect(episodeResponse.ok()).toBe(true);
  await page.request.post("/api/auth/logout");

  await page.goto("/registrazione");
  await page.getByLabel("Email").fill("utente-e2e@framory.test");
  await page.getByLabel("Username").fill("utentee2e");
  await page.getByLabel("Nome visualizzato").fill("Utente E2E");
  await page.getByLabel("Password").fill("PasswordSicura123!");
  await page.getByRole("button", { name: /Crea account/ }).click();
  await expect(page.getByText("Bentornato, Utente E2E")).toBeVisible();

  await page.goto("/scopri");
  await page.getByPlaceholder("Cerca franchise").fill("E2E Anime");
  await page.getByRole("button", { name: /Cerca/ }).click();
  await expect(page.getByRole("link", { name: "E2E Anime" })).toBeVisible();
  await page.getByRole("button", { name: /Libreria/ }).click();
  await expect(page.getByText("Franchise aggiunto alla libreria.")).toBeVisible();

  await page.getByRole("link", { name: "E2E Anime" }).click();
  await page.getByLabel("Segna episodio 1").check();
  await expect(page.getByText("100%")).toBeVisible();

  await page.goto("/");
  await expect(page.getByText("Episodi completati")).toBeVisible();
  await expect(page.getByRole("group", { name: "Episodi completati: 1" })).toBeVisible();

  await page.goto("/badge");
  const firstEpisodeBadge = page.locator("article").filter({ has: page.getByRole("heading", { name: "Primo episodio" }) });
  await expect(firstEpisodeBadge).toBeVisible();
  await firstEpisodeBadge.getByRole("button", { name: "Slot 1" }).click();
  await expect(page.getByText("Badge equipaggiato.")).toBeVisible();

  await page.goto("/impostazioni");
  await page.getByLabel("Privacy profilo").selectOption("privato");
  await page.getByRole("button", { name: /Salva/ }).click();
  await expect(page.getByText("Impostazioni salvate.")).toBeVisible();
});

test("autorizzazioni admin e account disattivato", async ({ page }) => {
  await page.goto("/registrazione");
  await page.getByLabel("Email").fill("noadmin@framory.test");
  await page.getByLabel("Username").fill("noadmin");
  await page.getByLabel("Nome visualizzato").fill("No Admin");
  await page.getByLabel("Password").fill("PasswordSicura123!");
  await page.getByRole("button", { name: /Crea account/ }).click();
  await expect(page.getByText("Bentornato, No Admin")).toBeVisible();
  await page.goto("/admin");
  await expect(page.getByText("Permesso moderazione richiesto.")).toBeVisible();

  const me = await (await page.request.get("/api/me")).json();
  await page.request.post("/api/auth/logout");
  await page.goto("/login");
  await page.getByLabel("Email").fill("owner@framory.test");
  await page.getByLabel("Password").fill("OwnerPassword123!");
  await page.getByRole("button", { name: /Entra/ }).click();
  await expect(page.getByText("Bentornato, Owner Framory")).toBeVisible();
  const deactivateResponse = await page.request.patch(`/api/admin/users/${me.user.id}`, { data: { isActive: false } });
  expect(deactivateResponse.ok()).toBe(true);
  await page.request.post("/api/auth/logout");

  await page.goto("/login");
  await page.getByLabel("Email").fill("noadmin@framory.test");
  await page.getByLabel("Password").fill("PasswordSicura123!");
  await page.getByRole("button", { name: /Entra/ }).click();
  await expect(page.getByText("Account disattivato.")).toBeVisible();
});

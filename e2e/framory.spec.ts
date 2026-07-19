import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  await request.post("/api/test/reset");
});

test("app usa Luckiest Guy", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("body")).toHaveCSS("font-family", /Luckiest Guy/);
  const brand = page.getByRole("link", { name: "Framory" });
  await expect(brand).toBeVisible();
  await expect(brand).toHaveCSS("font-family", /Luckiest Guy/);
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

test("pannello admin semplificato e badge custom", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("owner@framory.test");
  await page.getByLabel("Password").fill("OwnerPassword123!");
  await page.getByRole("button", { name: /Entra/ }).click();
  await expect(page.getByText("Bentornato, Owner Framory")).toBeVisible();

  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Import AniList" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Crea badge" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Crea Franchise" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Crea Work" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Crea Season" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Crea Episode" })).toHaveCount(0);

  const createPanel = page.locator("section").filter({ has: page.getByRole("heading", { name: "Crea badge" }) });
  await createPanel.getByPlaceholder("Nome badge").fill("Badge UI");
  await createPanel.getByPlaceholder("slug-badge").fill("badge-ui");
  await createPanel.getByPlaceholder("URL immagine badge").fill("https://example.com/badge-ui.png");
  await createPanel.getByPlaceholder("Descrizione").fill("Badge creato dal pannello admin.");
  await createPanel.locator('select[name="rarity"]').selectOption("epico");
  await createPanel.locator('select[name="category"]').selectOption("community");
  await createPanel.locator('select[name="conditionKind"]').selectOption("manual");
  await createPanel.getByRole("button", { name: /Crea badge/ }).click();
  await expect(page.locator("main").getByText("Badge creato.", { exact: true })).toBeVisible();

  const editor = page.getByRole("form", { name: "Editor badge badge-ui" });
  await expect(editor).toBeVisible();
  await editor.getByLabel("Nome badge").fill("Badge UI Editato");
  await editor.getByLabel("URL immagine badge").fill("https://example.com/badge-ui-editato.png");
  await editor.getByLabel("Solo owner").check();
  await editor.getByRole("button", { name: /Salva/ }).click();
  await expect(page.locator("main").getByText("Badge aggiornato.", { exact: true })).toBeVisible();
  await expect(editor.getByLabel("Nome badge")).toHaveValue("Badge UI Editato");
  await expect(editor.getByLabel("URL immagine badge")).toHaveValue("https://example.com/badge-ui-editato.png");

  page.once("dialog", (dialog) => dialog.accept());
  await editor.getByRole("button", { name: /Elimina/ }).click();
  await expect(page.locator("main").getByText("Badge eliminato.", { exact: true })).toBeVisible();
  await expect(page.getByRole("form", { name: "Editor badge badge-ui" })).toHaveCount(0);
});

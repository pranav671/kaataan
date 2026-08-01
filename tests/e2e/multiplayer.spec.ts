import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

const PLAYERS = [
  { name: "Maya", color: "Teal" },
  { name: "Arun", color: "Coral" },
  { name: "Bea", color: "Gold" },
  { name: "Chen", color: "Blue" },
  { name: "Dina", color: "Plum" },
] as const;

async function createRoom(page: Page): Promise<string> {
  await page.goto("/");
  await expect(page.getByText("Game server connected")).toBeVisible();
  await page.getByLabel("Profile name").fill(PLAYERS[0].name);
  await page.getByRole("button", { name: "Create my room" }).click();
  const code = (await page.locator(".invite-card strong").textContent())?.trim();
  expect(code).toMatch(/^[A-Z2-9]{6}$/);
  return code!;
}

async function joinRoom(browser: Browser, code: string, index: number): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`/?room=${code}`);
  await expect(page.getByRole("heading", { name: "Join your friends" })).toBeVisible();
  await page.getByLabel("Profile name").fill(PLAYERS[index]!.name);
  await page.getByRole("button", { name: PLAYERS[index]!.color }).click();
  await page.getByRole("button", { name: "Take my seat" }).click();
  await expect(page.getByRole("heading", { name: /Your island is forming/ })).toBeVisible();
  return { context, page };
}

test("creates, fills, reconnects, and launches a five-player room", async ({ browser, page }) => {
  const code = await createRoom(page);
  const guests: { context: BrowserContext; page: Page }[] = [];
  try {
    for (let index = 1; index < PLAYERS.length; index += 1) guests.push(await joinRoom(browser, code, index));
    await expect(page.getByRole("heading", { name: "5 of 6 seats filled" })).toBeVisible();
    for (const player of PLAYERS) await expect(page.locator(".seat-card").filter({ hasText: player.name })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { name: "5 of 6 seats filled" })).toBeVisible();
    await expect(page.locator(".seat-card").filter({ hasText: "Maya" })).toBeVisible();

    await page.getByRole("button", { name: "Mark me ready" }).click();
    for (const guest of guests) await guest.page.getByRole("button", { name: "Mark me ready" }).click();
    await expect(page.getByText("5 ready")).toBeVisible();
    await expect(page.getByRole("button", { name: /Start game/ })).toBeEnabled();
    await page.getByRole("button", { name: /Start game/ }).click();

    await expect(page.getByRole("region", { name: "Game board" })).toBeVisible();
    await expect(page.getByText(`Island ${code}`, { exact: false })).toBeVisible();
    await expect(page.getByRole("group", { name: "Interactive thirty-tile island board" })).toBeVisible();
  } finally {
    await Promise.all(guests.map((guest) => guest.context.close()));
  }
});

test("lets the host remove a lobby player and clears the removed session", async ({ browser, page }) => {
  const code = await createRoom(page);
  const guest = await joinRoom(browser, code, 1);
  try {
    await expect(page.getByRole("heading", { name: "2 of 6 seats filled" })).toBeVisible();
    await page.getByRole("button", { name: "Remove Arun from room" }).click();
    await page.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(page.getByRole("heading", { name: "1 of 6 seats filled" })).toBeVisible();

    await expect(guest.page.getByRole("heading", { name: "Create a private room" })).toBeVisible();
    await expect(guest.page.getByRole("alert")).toContainText("host removed you");
    await guest.page.reload();
    await expect(guest.page.getByRole("heading", { name: "Create a private room" })).toBeVisible();
    await expect(guest.page.getByRole("alert")).toHaveCount(0);
  } finally {
    await guest.context.close();
  }
});

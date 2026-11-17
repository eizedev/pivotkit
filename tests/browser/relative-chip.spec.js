// A relative date filter's chip names the days without data only where they lie before today (#586):
// "last 4 weeks" on the weather data, which end on Wednesday, Dec 31, 2025. The browser's clock is
// fixed, so the current week is not finished: the days from today on have no data yet and are not
// named. Days before today without rows still are, in the chip, its tooltip and the Filter level.
import { readFileSync } from "node:fs";
import { encodeViewLink } from "pivotkit-core/link";
import { chipMenu, expect, test } from "./fixtures.js";
import { unpack } from "../../examples/playground/data/sources.js";

const weather = unpack(JSON.parse(readFileSync(new URL("../../examples/playground/data/weather.json", import.meta.url), "utf8")));
const LAST_DAY = weather.map((r) => r.Date).sort().at(-1);
const view = { rows: ["City"], values: [{ agg: "count" }], filters: [{ field: "Date", type: "relative", unit: "week", count: 4 }] };
const chip = (page) => page.locator('[data-zone="filters"] .pk-chip[data-chip="Date"]');

/** The playground on the weather data with the view, the browser's clock at noon UTC of a day. */
async function open(page, day) {
    await page.clock.setFixedTime(new Date(`${day}T12:00:00Z`));
    await page.goto(`?data=weather&empty#pivot-playground=${encodeViewLink(view)}`);
    await expect(page.locator('[data-testid="pivot-table"]')).toBeVisible();
}

test("the day after the data end, mid-week: the chip says the range alone, as do its tooltip and the Filter level", async ({ page }) => {
    expect(LAST_DAY).toBe("2025-12-31");
    // Thursday, Jan 1, 2026: the week runs from Monday, Dec 29, to Sunday, Jan 4
    await open(page, "2026-01-01");
    const words = "last 4 weeks (Dec 8, 2025–Jan 4, 2026)";
    await expect(chip(page).getByTestId("rule-badge")).toHaveText(words);
    await expect(chip(page).locator(".pk-chip-label")).toHaveAttribute("title", `Date, ${words}`);
    await chipMenu(page, "Date", "filter");
    const menu = page.locator(".pk-chip-menu");
    await expect(menu.getByTestId("quick-last")).toBeChecked();
    await expect(menu.locator(".pk-filter-summary")).toContainText(words);
    await expect(menu.locator("[data-testid='fsection-quick']")).not.toContainText("no data");
});

test("days before today without rows still warn", async ({ page }) => {
    // Tuesday, Jan 6, 2026: Jan 1 to Jan 5 have passed without rows. A year without any data is
    // named as the year
    await open(page, "2026-01-06");
    const words = "last 4 weeks (Dec 15, 2025–Dec 31, 2025; 2026 has no data)";
    await expect(chip(page).getByTestId("rule-badge")).toHaveText(words);
    await chipMenu(page, "Date", "filter");
    await expect(page.locator(".pk-chip-menu .pk-filter-summary")).toContainText(words);
});

// The table and the chart side by side (#51): the tab Both on a wide report, the divider that a drag
// and the arrow keys move, a settings button per part; a narrower report shows the table and offers
// the tabs Table and Chart only.
import { encodeViewLink, readViewLink } from "pivotkit-core/link";
import { expect, test } from "./fixtures.js";

const VIEW = { rows: ["Region"], cols: ["Category"], values: [{ field: "Revenue", agg: "sum" }] };
const open = (page, view = VIEW) => page.goto(`?data=sales&lang=en&empty#pivot-playground=${encodeViewLink(view)}`);

test("Both shows the table and the chart side by side; the divider moves; each part has its settings", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page);
    await page.getByTestId("show-both").click();
    const both = page.getByTestId("side-by-side");
    await expect(both.locator(".pk-table")).toBeVisible();
    await expect(both.getByTestId("pivot-chart").locator("canvas").first()).toBeVisible();
    await expect(page.getByTestId("show-both")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("table-settings")).toBeVisible();
    await expect(page.getByTestId("chart-settings")).toBeVisible();
    // the divider: a separator in the middle; the keys move it in steps, Home and End to the ends
    const divider = page.getByTestId("split-divider");
    await expect(divider).toHaveAttribute("aria-valuenow", "50");
    await divider.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(divider).toHaveAttribute("aria-valuenow", "45");
    await page.keyboard.press("End");
    await expect(divider).toHaveAttribute("aria-valuenow", "75");
    // a drag: the table's share follows the pointer
    const box = await both.boundingBox();
    const at = await divider.boundingBox();
    await page.mouse.move(at.x + at.width / 2, at.y + 40);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.4, at.y + 40, { steps: 5 });
    await page.mouse.up();
    await expect(divider).toHaveAttribute("aria-valuenow", "40");
    const tableWidth = await both.locator(".pk-both-table").evaluate((el) => el.getBoundingClientRect().width);
    expect(Math.abs(tableWidth / box.width - 0.4)).toBeLessThan(0.03);
    // a chart type picked in the chart's settings keeps both
    await page.getByTestId("chart-settings").click();
    await page.getByTestId("chart-line").click();
    // the link's view: lines, still both
    const shownView = async () => readViewLink(await page.evaluate(() => location.hash), "playground").view;
    await expect.poll(async () => [(await shownView()).chart.type, (await shownView()).display]).toEqual(["line", "both"]);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("show-both")).toHaveAttribute("aria-selected", "true");
    // the divider stays where it was after a look at the table alone
    await page.getByTestId("show-table").click();
    await page.getByTestId("show-both").click();
    await expect(divider).toHaveAttribute("aria-valuenow", "40");
    await expect(divider).toHaveAttribute("aria-valuetext", "Table 40 %, chart 60 %");
    await expect(page.getByTestId("enlarge")).toHaveAttribute("title", "Enlarge the table and the chart");
    // the link keeps display both
    await page.reload();
    await expect(page.getByTestId("side-by-side")).toBeVisible();
});

test("a report narrower than wide shows the table of a view with both, and no tab Both", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, { ...VIEW, display: "both" });
    await expect(page.locator(".pk-table")).toBeVisible();
    await expect(page.getByTestId("side-by-side")).toHaveCount(0);
    await expect(page.getByTestId("show-both")).toHaveCount(0);
    await expect(page.getByTestId("show-table")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("view-settings")).toBeVisible();
});

test("the export of a picture works while both are shown", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, { ...VIEW, display: "both" });
    await expect(page.getByTestId("side-by-side").getByTestId("pivot-chart").locator("canvas").first()).toBeVisible();
    await page.getByTestId("export").click();
    await expect(page.getByTestId("export-png")).not.toHaveAttribute("aria-disabled", "true");
    await expect(page.getByTestId("export-png")).toBeEnabled();
});

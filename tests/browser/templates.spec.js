// Templates: the Views menu's two groups (shared views and the user's own), the browser store
// (templateStore="browser"), "Publish as shared view", the templates of an OpenAPI document
// (x-pivotkit-views) in the playground, and the same in the web component.
import { expect, test, toolbar } from "./fixtures.js";

/** The names of the entries of a group of the Views menu ("sharedViews" or "myViews"), in order. */
const group = (scope, id) => scope.locator(`[data-section="${id}"] [data-pk-entry] [data-pk-option]`).allInnerTexts();

test.describe("the playground's Views menu", () => {
    test("shared views and my views: the i says who changes shared views, the browser store keeps mine", async ({ page }) => {
        await page.goto("?data=tickets");
        await toolbar(page, "views");
        await expect(page.getByTestId("section-sharedViews")).toHaveText("Shared views");
        await expect(page.getByTestId("section-myViews")).toHaveText("My views");
        expect(await group(page, "sharedViews")).toEqual(["Tickets per team and priority", "Median lead time by month", "Open work per team (chart)"]);
        // a shared view nobody here may change: no delete, no publish; the i explains it
        await expect(page.locator('[data-section="sharedViews"] [data-testid^="delete-view-"]')).toHaveCount(0);
        await expect(page.locator('[data-section="sharedViews"] [data-testid^="publish-view-"]')).toHaveCount(0);
        const info = page.locator('[data-section="sharedViews"] [data-testid="setting-info-sharedView"]').first();
        await expect(info).toHaveAccessibleName("About Tickets per team and priority");
        await info.focus();
        await expect(page.locator(".pk-info-pop")).toContainText("Only admins can change shared views.");
        // where my views are kept, said where they are saved
        await expect(page.getByTestId("store-note")).toHaveText("Kept in this browser only: not on other devices, and gone when the site's data is cleared.");

        await page.getByTestId("saved-view-name").fill("Mine");
        await page.getByTestId("saved-view-name").press("Enter");
        await expect(page.locator(".pk-toasts")).toContainText("View “Mine” saved");
        expect(await group(page, "myViews")).toEqual(["Mine"]);
        // in localStorage under the report's storageKey, as view files naming their data
        const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("pivotkit:views:playground") ?? "null"));
        expect(stored).toEqual([expect.objectContaining({ format: "pivotkit-view", name: "Mine", source: { id: "tickets" } })]);

        // a reload keeps it; another data set does not show it, and has none of its own
        await page.reload();
        await toolbar(page, "views");
        expect(await group(page, "myViews")).toEqual(["Mine"]);
        await page.keyboard.press("Escape");
        await page.getByTestId("pg-dataset").selectOption("sales");
        await toolbar(page, "views");
        expect(await group(page, "myViews")).toEqual([]);
        await page.keyboard.press("Escape");
        await page.getByTestId("pg-dataset").selectOption("tickets");
        await toolbar(page, "views");
        expect(await group(page, "myViews")).toEqual(["Mine"]);

        // delete asks in place; Cancel puts the focus back on the entry
        await page.getByTestId("delete-view-Mine").click();
        await expect(page.getByText("Delete “Mine”?")).toBeVisible();
        await page.getByRole("button", { name: "Cancel" }).click();
        await expect(page.getByTestId("saved-view-Mine")).toBeFocused();
        await page.getByTestId("delete-view-Mine").click();
        await page.getByTestId("confirm-delete").click();
        await expect(page.locator(".pk-toasts")).toContainText("View “Mine” deleted");
        expect(await group(page, "myViews")).toEqual([]);
        expect(await page.evaluate(() => localStorage.getItem("pivotkit:views:playground"))).toBeNull();
    });

    test("publish: a view of mine becomes a shared view, after asking; the host may delete it", async ({ page }) => {
        await page.goto("?data=tickets");
        await toolbar(page, "views");
        await page.getByTestId("saved-view-name").fill("For the team");
        await page.getByTestId("saved-view-name").press("Enter");
        await expect(page.getByTestId("saved-view-For the team")).toBeVisible();
        await page.getByRole("button", { name: "Publish For the team as a shared view" }).click();
        await expect(page.getByText("Publish “For the team” as a shared view? Everyone who uses this report sees it.")).toBeVisible();
        await expect(page.getByTestId("confirm-publish")).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(page.locator(".pk-toasts")).toContainText("View “For the team” published");
        // the host's new shared entry: deletable (the playground's user is its admin), no i
        await expect.poll(() => group(page, "sharedViews")).toContain("For the team");
        const shared = page.locator('[data-section="sharedViews"] [data-pk-entry]').filter({ hasText: "For the team" });
        await expect(shared.getByTestId("setting-info-sharedView")).toHaveCount(0);
        await expect(shared.getByTestId("publish-view-For the team")).toHaveCount(0);
        // the focus is back on the entry that was published
        await expect(page.locator('[data-section="myViews"]').getByTestId("saved-view-For the team")).toBeFocused();
        await shared.getByTestId("delete-view-For the team").click();
        await page.getByTestId("confirm-delete").click();
        await expect(page.locator(".pk-toasts")).toContainText("View “For the team” deleted");
        await expect.poll(() => group(page, "sharedViews")).not.toContain("For the team");
        expect(await group(page, "myViews")).toEqual(["For the team"]);
    });

    test("the views of an OpenAPI document (x-pivotkit-views) are shared views that load", async ({ page }) => {
        await page.goto("?data=endoflife");
        await toolbar(page, "views");
        const names = await group(page, "sharedViews");
        expect(names.slice(-2)).toEqual(["Long-term support cycles per category", "Release cycles per year (chart)"]);
        await page.getByTestId("saved-view-Long-term support cycles per category").click();
        await expect(page.locator(".pk-toasts")).toContainText("View “Long-term support cycles per category” loaded");
        await expect(page.locator('[data-zone="cols"] .pk-chip[data-chip="LTS"]')).toHaveCount(1);
    });

    test("in German, at phone width: the groups in the sheet at the bottom", async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto("?data=tickets&lang=de");
        await toolbar(page, "views");
        await expect(page.getByTestId("section-sharedViews")).toHaveText("Gemeinsame Ansichten");
        await expect(page.getByTestId("section-myViews")).toHaveText("Meine Ansichten");
        await page.getByTestId("saved-view-name").fill("Meins");
        await page.getByTestId("saved-view-name").press("Enter");
        await expect(page.locator(".pk-toasts")).toContainText("Ansicht „Meins“ gespeichert");
        const publish = page.getByRole("button", { name: "Meins als gemeinsame Ansicht veröffentlichen" });
        await publish.scrollIntoViewIfNeeded();
        const box = await publish.boundingBox();
        // inside the window, and big enough to tap
        expect(box.x + box.width).toBeLessThanOrEqual(390);
        expect(box.width).toBeGreaterThanOrEqual(24);
    });
});

test("web component: templates from view files, the browser store, publish and delete with their scope", async ({ page }) => {
    await page.goto("pages/element-views.html");
    const report = page.locator("#views");
    await report.locator('[data-testid="pivot-table"]').waitFor();
    const views = report.getByTestId("views");
    if (await views.count()) await views.click();
    else {
        await report.getByTestId("more").click();
        await report.getByTestId("more-views").click();
    }
    // the name of a view file entry is the file's
    expect(await group(report, "sharedViews")).toEqual(["From a view file", "Team view"]);
    // the shared view an admin may delete has a delete button instead of the i
    await expect(report.getByTestId("delete-view-Team view")).toBeVisible();
    await expect(report.locator('[data-section="sharedViews"] [data-testid="setting-info-sharedView"]')).toHaveCount(1);
    // no save-templates: the browser store takes the save, no event
    await report.getByTestId("saved-view-name").fill("Mine");
    await report.getByTestId("saved-view-name").press("Enter");
    await expect(report.locator(".pk-toasts")).toContainText("View “Mine” saved");
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("pivotkit:views:views-page"))[0].name)).toBe("Mine");
    await report.getByTestId("publish-view-Mine").click();
    await report.getByTestId("confirm-publish").click();
    await expect(report.locator(".pk-toasts")).toContainText("View “Mine” published");
    await expect.poll(() => group(report, "sharedViews")).toEqual(["From a view file", "Team view", "Mine"]);
    await report.locator('[data-section="sharedViews"]').getByTestId("delete-view-Team view").click();
    await report.getByTestId("confirm-delete").click();
    await expect.poll(() => group(report, "sharedViews")).toEqual(["From a view file", "Mine"]);
    const events = await page.evaluate(() => window.__events);
    expect(events.map((e) => [e.type, e.detail.name, e.detail.scope])).toEqual([
        ["pivot-template-publish", "Mine", undefined],
        ["pivot-template-delete", "Team view", "shared"]
    ]);
    // the published view is normalized against the data, never the stored text as it is
    expect(events[0].detail.view.version).toEqual(expect.any(Number));
    expect(events[0].detail.view.totals).toEqual(expect.any(Object));
});

test("no i about admins where nobody here can change shared views", async ({ page }) => {
    // the sales element: shared presets, no Publish, no deletable shared entry
    await page.goto("pages/element-two.html");
    const sales = page.locator("#sales");
    await sales.locator('[data-testid="pivot-table"]').waitFor();
    const views = sales.getByTestId("views");
    if (await views.count()) await views.click();
    else {
        await sales.getByTestId("more").click();
        await sales.getByTestId("more-views").click();
    }
    await expect(sales.locator('[data-section="sharedViews"] [data-pk-entry]').first()).toBeVisible();
    await expect(sales.locator('[data-testid="setting-info-sharedView"]')).toHaveCount(0);
});

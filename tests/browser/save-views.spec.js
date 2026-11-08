// Save, Save as and New in the Views menu and the toolbar: the loaded view's name next to Views with a
// mark while it has unsaved changes, Save under that name (the browser store in its place, a shared
// view only for a user who may publish), Save as asking before it replaces a view of the same name,
// New (an empty report) that Undo takes back; and the Export menu off for an empty report.
import { chips, expect, test, toolbar } from "./fixtures.js";

/** The names of the entries of "My views", in order. */
const mine = (scope) => scope.locator('[data-section="myViews"] [data-pk-entry] [data-pk-option]').allInnerTexts();
/** The browser store of the playground's report, parsed. */
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("pivotkit:views:playground") ?? "null"));

/** Opens the Views menu of an element (its own button, or through "More"). */
async function elementViews(report) {
    const views = report.getByTestId("views");
    if (await views.count()) await views.click();
    else {
        await report.getByTestId("more").click();
        await report.getByTestId("more-views").click();
    }
}

test("Save writes the loaded view under its name; the toolbar marks unsaved changes", async ({ page }) => {
    await page.goto("?data=tickets");
    // nothing loaded: no name in the toolbar, no Save in the menu (Save as only)
    await toolbar(page, "views");
    await expect(page.getByTestId("view-name")).toHaveCount(0);
    await expect(page.getByTestId("save-loaded")).toHaveCount(0);
    await expect(page.getByTestId("section-thisView")).toHaveText("This view");
    await page.getByTestId("saved-view-name").fill("Mine");
    await page.getByTestId("saved-view-name").press("Enter");
    await expect(page.locator(".pk-toasts")).toContainText("View “Mine” saved");
    // the view shown is the saved one now: its name next to Views, no mark
    await expect(page.getByTestId("view-name")).toHaveText("Mine");
    await expect(page.getByTestId("view-changed")).toHaveCount(0);
    await page.keyboard.press("Escape");

    // a change: the mark, with its words for a screen reader
    await page.getByTestId("show-chart").click();
    await expect(page.getByTestId("view-changed")).toHaveText("Unsaved changes");
    await expect(page.getByTestId("view-name")).toHaveAttribute("title", "Mine (Unsaved changes)");
    // Save: one click, the same name, in its place in the store; the menu closes
    await toolbar(page, "views");
    await expect(page.getByTestId("save-loaded")).toHaveText("Save “Mine”");
    await page.getByTestId("save-loaded").click();
    await expect(page.locator(".pk-toasts")).toContainText("View “Mine” saved");
    await expect(page.getByTestId("view-changed")).toHaveCount(0);
    const views = await stored(page);
    expect(views.map((v) => v.name)).toEqual(["Mine"]);
    expect(views[0].view.display).toBe("chart");
    // Undo goes back to a view that differs from the saved one: the mark again
    await page.getByTestId("undo").click();
    await expect(page.getByTestId("view-changed")).toHaveCount(1);
    await toolbar(page, "views");
    expect(await mine(page)).toEqual(["Mine"]);
});

test("Save as onto a name that exists asks first: Cancel keeps the view, Replace writes over it", async ({ page }) => {
    await page.goto("?data=tickets");
    await toolbar(page, "views");
    await page.getByTestId("saved-view-name").fill("Mine");
    await page.getByTestId("saved-view-name").press("Enter");
    await expect(page.locator(".pk-toasts")).toContainText("View “Mine” saved");
    await page.keyboard.press("Escape");
    await page.getByTestId("show-chart").click();

    await toolbar(page, "views");
    // a view is loaded: the field is "Save as…"
    await expect(page.locator('[data-section="thisView"] .pk-subtitle')).toHaveText("Save as…");
    await page.getByTestId("saved-view-name").fill("Mine");
    await page.getByTestId("saved-view-name").press("Enter");
    await expect(page.getByTestId("replace-confirm")).toContainText("“Mine” exists. Replace it?");
    await expect(page.getByTestId("confirm-replace")).toBeFocused();
    // Cancel: nothing saved, the field again with the name in it and the focus
    await page.getByTestId("cancel-replace").click();
    await expect(page.getByTestId("saved-view-name")).toHaveValue("Mine");
    await expect(page.getByTestId("saved-view-name")).toBeFocused();
    expect((await stored(page))[0].view.display).toBe("table");
    // Replace: the view of that name is written over, in its place; no second entry
    await page.getByTestId("saved-view-name").press("Enter");
    await page.getByTestId("confirm-replace").click();
    await expect(page.locator(".pk-toasts")).toContainText("View “Mine” saved");
    const views = await stored(page);
    expect(views.map((v) => v.name)).toEqual(["Mine"]);
    expect(views[0].view.display).toBe("chart");
    expect(await mine(page)).toEqual(["Mine"]);
    await expect(page.getByTestId("saved-view-name")).toHaveValue("");
});

test("New empties the report in one step; Undo brings the view and its name back", async ({ page }) => {
    await page.goto("?data=tickets");
    await toolbar(page, "views");
    await page.getByTestId("saved-view-Median lead time by month").click();
    await expect(page.getByTestId("view-name")).toHaveText("Median lead time by month");
    const before = await chips(page, "values");
    expect(before.length).toBeGreaterThan(0);

    await toolbar(page, "new");
    await expect(page.getByTestId("empty-state")).toContainText("Build your report in three steps");
    await expect(page.locator(".pk-toasts")).toContainText("New, empty report");
    await expect(page.getByTestId("view-name")).toHaveCount(0);
    // empty already: New is off, in the menu with the reason
    await toolbar(page, "views");
    await expect(page.getByTestId("new-report")).toBeDisabled();
    await expect(page.getByTestId("new-report")).toContainText("The report is empty already.");
    await page.keyboard.press("Escape");

    await page.getByTestId("undo").click();
    await expect(page.locator(".pk-toasts")).toContainText("Undone: new, empty report");
    await expect(page.getByTestId("empty-state")).toHaveCount(0);
    expect(await chips(page, "values")).toEqual(before);
    await expect(page.getByTestId("view-name")).toHaveText("Median lead time by month");
    await expect(page.getByTestId("view-changed")).toHaveCount(0);

    // New from the Views menu does the same
    await toolbar(page, "views");
    await page.getByTestId("new-report").click();
    await expect(page.getByTestId("empty-state")).toBeVisible();
});

test("an empty report has nothing to export: every entry is off and says why", async ({ page }) => {
    await page.goto("?data=tickets&start=empty");
    await expect(page.getByTestId("empty-state")).toBeVisible();
    await toolbar(page, "export");
    for (const id of ["export-xlsx", "export-csv", "export-png", "export-copy-table", "export-copy-json"]) {
        await expect(page.getByTestId(id)).toBeDisabled();
        await expect(page.getByTestId(id)).toContainText("Add a field first.");
    }
});

test("web component: a shared view saves only for a user who may publish; New and an empty Export send no event", async ({ page }) => {
    await page.goto("pages/element-views.html");
    const report = page.locator("#views");
    await report.locator('[data-testid="pivot-table"]').waitFor();
    await page.evaluate(() => {
        window.__exports = [];
        document.addEventListener("pivot-export", (e) => window.__exports.push(e.detail.kind));
        document.getElementById("views").canPublish = false;
    });
    await elementViews(report);
    await report.getByTestId("saved-view-Team view").click();
    await expect(report.getByTestId("view-name")).toHaveText("Team view");
    // no right to publish: Save is off, the reason says what to do
    await elementViews(report);
    await expect(report.getByTestId("save-loaded")).toBeDisabled();
    await expect(report.getByTestId("save-loaded")).toContainText("Shared view: you cannot change it. Use Save as.");
    await page.keyboard.press("Escape");

    // may publish: Save is a publish under the same name, normalized against the data
    await page.evaluate(() => (document.getElementById("views").canPublish = true));
    await elementViews(report);
    await report.getByTestId("save-loaded").click();
    await expect(report.locator(".pk-toasts")).toContainText("View “Team view” saved");
    const events = await page.evaluate(() => window.__events);
    expect(events.map((e) => [e.type, e.detail.name])).toEqual([["pivot-template-publish", "Team view"]]);
    expect(events[0].detail.view.version).toEqual(expect.any(Number));

    // New, then the Export menu of the empty report: off, and a click sends no pivot-export
    await elementViews(report);
    await report.getByTestId("new-report").click();
    await expect(report.getByTestId("empty-state")).toBeVisible();
    await report.getByTestId("export").click();
    await expect(report.getByTestId("export-csv")).toBeDisabled();
    await report.getByTestId("export-csv").click({ force: true });
    await report.getByTestId("export-copy-json").click({ force: true });
    expect(await page.evaluate(() => window.__exports)).toEqual([]);
});

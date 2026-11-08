// Save, Save as and New in the Views menu and the toolbar: the loaded view's name next to Views with a
// mark while it has unsaved changes (gone after New and Reset), Save under that name (the browser store in its place, a shared
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

test("New and Reset take the loaded view's name away; Undo brings the view and its name back", async ({ page }) => {
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
    // Redo: the empty report again, without the name (Save could write it over the view)
    await page.getByTestId("redo").click();
    await expect(page.getByTestId("empty-state")).toBeVisible();
    await expect(page.getByTestId("view-name")).toHaveCount(0);
    await toolbar(page, "views");
    await expect(page.getByTestId("save-loaded")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.getByTestId("undo").click();
    await expect(page.getByTestId("view-name")).toHaveText("Median lead time by month");

    // Reset shows the start view, not the loaded one: the name goes too (no Save over that view
    // with the start view), and Undo brings both back
    await toolbar(page, "reset");
    await expect(page.locator(".pk-toasts")).toContainText("Back to the start view");
    await expect(page.getByTestId("view-name")).toHaveCount(0);
    await page.getByTestId("undo").click();
    expect(await chips(page, "values")).toEqual(before);
    await expect(page.getByTestId("view-name")).toHaveText("Median lead time by month");

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

    // no publish anywhere: the user's own view has no Publish either, and no event was sent
    await report.getByTestId("saved-view-name").fill("Mine");
    await report.getByTestId("saved-view-name").press("Enter");
    await expect(report.getByTestId("saved-view-Mine")).toBeVisible();
    await expect(report.locator('[data-testid^="publish-view-"]')).toHaveCount(0);
    expect(await page.evaluate(() => window.__events)).toEqual([]);
    await page.keyboard.press("Escape");
    await elementViews(report);
    await report.getByTestId("saved-view-Team view").click();

    // may publish: Save asks first (everyone sees it); Cancel sends nothing, Replace publishes under
    // the same name, normalized against the data
    await page.evaluate(() => (document.getElementById("views").canPublish = true));
    await elementViews(report);
    await report.getByTestId("save-loaded").click();
    await expect(report.getByTestId("replace-shared-confirm")).toContainText("Replace the shared view “Team view” for everyone?");
    await expect(report.getByTestId("confirm-replace-shared")).toBeFocused();
    await report.getByTestId("cancel-replace-shared").click();
    expect(await page.evaluate(() => window.__events)).toEqual([]);
    await report.getByTestId("save-loaded").click();
    await report.getByTestId("confirm-replace-shared").click();
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

test("web component, the host's saves: Save and Save as send the name with scope user; a slow answer keeps later changes unsaved", async ({ page }) => {
    await page.goto("pages/element-views.html");
    const report = page.locator("#views");
    await report.locator('[data-testid="pivot-table"]').waitFor();
    await page.evaluate(() => {
        const el = document.getElementById("views");
        // the host keeps the user's views: its own entry, its answer after 400 ms
        el.saveTemplates = true;
        el.templates = [...el.templates, { name: "Host mine", view: { rows: ["Region"], values: [{ field: "Units", agg: "sum" }] }, scope: "user", deletable: true }];
        el.addEventListener("pivot-template-save", (e) => e.detail.respondWith(new Promise((done) => setTimeout(done, 400))));
    });
    await elementViews(report);
    await report.getByTestId("saved-view-Host mine").click();
    await expect(report.getByTestId("view-name")).toHaveText("Host mine");
    await report.getByTestId("show-chart").click();
    await expect(report.getByTestId("view-changed")).toHaveCount(1);
    // Save, then a change before the host answers: the change is not saved, the mark stays
    await elementViews(report);
    await report.getByTestId("save-loaded").click();
    await report.getByTestId("show-table").click();
    await expect(report.locator(".pk-toasts")).toContainText("View “Host mine” saved");
    await expect(report.getByTestId("view-changed")).toHaveCount(1);
    // back to what was saved: no mark
    await report.getByTestId("show-chart").click();
    await expect(report.getByTestId("view-changed")).toHaveCount(0);

    // Save as onto the host's view: asks, then the same event with that name
    await elementViews(report);
    await expect(report.getByTestId("saved-view-name").locator("xpath=following::button[1]")).toHaveText("Save as");
    await report.getByTestId("saved-view-name").fill("Host mine");
    await report.getByTestId("saved-view-name").press("Enter");
    await report.getByTestId("confirm-replace").click();
    await expect.poll(() => page.evaluate(() => window.__events.length)).toBe(2);
    const events = await page.evaluate(() => window.__events);
    expect(events.map((e) => [e.type, e.detail.name, e.detail.scope, e.detail.view.display])).toEqual([
        ["pivot-template-save", "Host mine", "user", "chart"],
        ["pivot-template-save", "Host mine", "user", "chart"]
    ]);
});

test("web component: another source with the same columns keeps the view, not the name of a view loaded for the first", async ({ page }) => {
    await page.goto("pages/element-views.html");
    const report = page.locator("#views");
    await report.locator('[data-testid="pivot-table"]').waitFor();
    await elementViews(report);
    await report.getByTestId("saved-view-Team view").click();
    await expect(report.getByTestId("view-name")).toHaveText("Team view");
    await page.evaluate(() => (document.getElementById("views").sourceId = "other"));
    await expect(report.getByTestId("view-name")).toHaveCount(0);
    await expect(report.locator('[data-testid="pivot-chart"], [data-testid="pivot-table"]').first()).toBeVisible();
});

test("two views of one name in the browser store (one without named data): Save writes the one loaded", async ({ page }) => {
    await page.goto("?data=tickets");
    await toolbar(page, "views");
    await page.getByTestId("saved-view-name").fill("Dup");
    await page.getByTestId("saved-view-name").press("Enter");
    await expect(page.locator(".pk-toasts")).toContainText("View “Dup” saved");
    // a second "Dup" before it, saved without named data (an older version, another program)
    await page.evaluate(() => {
        const [mine] = JSON.parse(localStorage.getItem("pivotkit:views:playground"));
        const plain = { ...mine, view: { ...mine.view, display: "chart" } };
        delete plain.source;
        localStorage.setItem("pivotkit:views:playground", JSON.stringify([plain, mine]));
    });
    await page.reload();
    await toolbar(page, "views");
    const both = page.locator('[data-section="myViews"] [data-testid="saved-view-Dup"]');
    await expect(both).toHaveCount(2);
    // the second, this data's: changed and saved; the first stays as it was
    await both.nth(1).click();
    await page.getByTestId("show-chart").click();
    await toolbar(page, "views");
    await page.getByTestId("save-loaded").click();
    await expect(page.locator(".pk-toasts")).toContainText("View “Dup” saved");
    const views = await stored(page);
    expect(views.map((v) => [v.name, v.source?.id ?? null, v.view.display])).toEqual([
        ["Dup", null, "chart"],
        ["Dup", "tickets", "chart"]
    ]);
});

test("a view from a file or a link has a name but is not among the saved views: Save is off, Save as works", async ({ page }) => {
    await page.goto("?data=tickets");
    await toolbar(page, "views");
    await page.getByTestId("saved-view-name").fill("Tmp");
    await page.getByTestId("saved-view-name").press("Enter");
    await expect(page.locator(".pk-toasts")).toContainText("View “Tmp” saved");
    const file = await page.evaluate(() => ({ ...JSON.parse(localStorage.getItem("pivotkit:views:playground"))[0], name: "From a file" }));
    await page.getByTestId("load-view").click();
    await page.getByTestId("load-view-text").fill(JSON.stringify(file));
    await page.getByTestId("load-view-apply").click();
    await expect(page.getByTestId("view-name")).toHaveText("From a file");
    await toolbar(page, "views");
    await expect(page.getByTestId("save-loaded")).toBeDisabled();
    await expect(page.getByTestId("save-loaded")).toContainText("Not saved yet. Use Save as.");
});

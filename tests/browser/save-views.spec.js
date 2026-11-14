// Save and Save as in the Views menu, New under Start over, Views in the toolbar of a desktop window: the loaded view's name next to Views with a
// mark while it has unsaved changes (gone after New and Reset), Save under that name (the browser store in its place, a shared
// view only for a user who may publish), Save as asking before it replaces a view of the same name,
// New (an empty report) that Undo takes back; and the Export menu off for an empty report.
import { chips, expect, openSaveAs, startOver, test, toolbar } from "./fixtures.js";

/** The names of the entries of "My views", in order. */
const mine = (scope) => scope.getByTestId("topic-myViews").locator('[data-pk-item^="entry:"]').allInnerTexts();
/** The browser store of the playground's report, parsed. */
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("pivotkit:views:playground") ?? "null"));

/** Opens the Views menu of an element (its own button, or through "More"); an open one stays open. */
async function elementViews(report) {
    const views = report.getByTestId("views");
    if (await views.count()) {
        if ((await views.getAttribute("aria-expanded")) !== "true") await views.click();
    }
    else {
        await report.getByTestId("more").click();
        await report.getByTestId("more-views").click();
    }
}

for (const width of [1280, 1440]) {
    test(`a desktop window ${width} px wide: Views stays in the toolbar with a view loaded, next to its name`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto("?data=tickets");
        await toolbar(page, "views");
        await page.getByTestId("saved-view-Median lead time by month").click();
        await page.keyboard.press("Escape");
        await expect(page.getByTestId("view-name")).toHaveText("Median lead time by month");
        // Views is the last button to move into "More": a first-time user finds where to save
        const bar = page.locator(".pk-toolbar");
        await expect(bar.getByTestId("views")).toBeVisible();
        await expect(bar.getByTestId("view-name")).toBeVisible();
        if (await bar.getByTestId("more").count()) {
            await bar.getByTestId("more").click();
            await expect(page.getByTestId("more-views")).toHaveCount(0);
            await page.keyboard.press("Escape");
        }
        // the name never shrinks below its 4em: a few letters always show
        const em = await bar.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
        expect((await bar.getByTestId("view-name").boundingBox()).width).toBeGreaterThanOrEqual(4 * em - 0.5);
        // the name sits before Views and never pushes it out of the toolbar's line
        const name = await bar.getByTestId("view-name").boundingBox();
        const views = await bar.getByTestId("views").boundingBox();
        const box = await bar.boundingBox();
        expect(name.x + name.width).toBeLessThanOrEqual(views.x);
        expect(views.x + views.width).toBeLessThanOrEqual(box.x + box.width);
    });
}

test("on a phone, with Views in More: More carries the dot for unsaved changes too", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("?data=tickets");
    await toolbar(page, "views");
    await page.getByTestId("saved-view-Median lead time by month").click();
    await expect(page.getByTestId("view-name")).toHaveText("Median lead time by month");
    await expect(page.getByTestId("more-changed")).toHaveCount(0);
    // a change: the other of Table and Chart
    const chart = (await page.getByTestId("show-chart").getAttribute("aria-pressed")) === "true";
    await page.getByTestId(chart ? "show-table" : "show-chart").click();
    await expect(page.getByTestId("more").getByTestId("more-changed")).toHaveText("Unsaved changes");
    await expect(page.getByTestId("view-changed")).toHaveCount(1);
});

test("Save writes the loaded view under its name; the toolbar marks unsaved changes", async ({ page }) => {
    await page.goto("?data=tickets");
    // nothing loaded: no name in the toolbar, no Save in the menu (Save as only)
    await toolbar(page, "views");
    await expect(page.getByTestId("view-name")).toHaveCount(0);
    await expect(page.getByTestId("save-loaded")).toHaveCount(0);
    await expect(page.getByTestId("topic-title-thisView")).toHaveText("This view");
    await openSaveAs(page);
    await page.getByTestId("saved-view-name").fill("Mine");
    await page.getByTestId("saved-view-name").press("Enter");
    await expect(page.locator(".pk-toasts")).toContainText("View “Mine” saved");
    // a save closes the menu, the focus back on Views; there the saved view is marked as the one loaded
    await expect(page.getByTestId("views")).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByTestId("views")).toBeFocused();
    await toolbar(page, "views");
    await expect(page.getByTestId("saved-view-Mine")).toHaveAttribute("aria-current", "true");
    await page.keyboard.press("Escape");
    // the view shown is the saved one now: its name next to Views, no mark
    await expect(page.getByTestId("view-name")).toHaveText("Mine");
    await expect(page.getByTestId("view-changed")).toHaveCount(0);
    await page.keyboard.press("Escape");

    // a change: the mark, with its words for a screen reader
    await page.getByTestId("show-chart").click();
    await expect(page.getByTestId("view-changed")).toHaveText("Unsaved changes");
    // Views is in the toolbar: no dot on More
    await expect(page.getByTestId("more-changed")).toHaveCount(0);
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
    await openSaveAs(page);
    await page.getByTestId("saved-view-name").fill("Mine");
    await page.getByTestId("saved-view-name").press("Enter");
    await expect(page.locator(".pk-toasts")).toContainText("View “Mine” saved");
    await page.keyboard.press("Escape");
    await page.getByTestId("show-chart").click();

    await toolbar(page, "views");
    // a view is loaded: the entry is "Save as…"
    await expect(page.getByTestId("save-as")).toHaveText("Save as…");
    await openSaveAs(page);
    await page.getByTestId("saved-view-name").fill("Mine");
    await page.getByTestId("saved-view-name").press("Enter");
    await expect(page.getByTestId("replace-confirm")).toContainText("“Mine” exists. Replace it?");
    // the focus on Cancel: Enter never writes over a view by accident
    await expect(page.getByTestId("cancel-replace")).toBeFocused();
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
    await expect(page.getByTestId("views")).toBeFocused();
    await toolbar(page, "views");
    expect(await mine(page)).toEqual(["Mine"]);
    // the name field starts empty again
    await openSaveAs(page);
    await expect(page.getByTestId("saved-view-name")).toHaveValue("");
});

test("New and Reset take the loaded view's name away; Undo brings the view and its name back", async ({ page }) => {
    await page.goto("?data=tickets");
    await toolbar(page, "views");
    await page.getByTestId("saved-view-Median lead time by month").click();
    await expect(page.getByTestId("view-name")).toHaveText("Median lead time by month");
    const before = await chips(page, "values");
    expect(before.length).toBeGreaterThan(0);

    await (await startOver(page, "new-report")).click();
    await expect(page.getByTestId("empty-state")).toContainText("Build your report in three steps");
    await expect(page.locator(".pk-toasts")).toContainText("New, empty report");
    await expect(page.getByTestId("view-name")).toHaveCount(0);
    // empty already: New is off, in the menu with the reason
    const off = await startOver(page, "new-report");
    await expect(off).toBeDisabled();
    await expect(off).toContainText("The report is empty already.");
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

    // New does the same
    await (await startOver(page, "new-report")).click();
    await expect(page.getByTestId("empty-state")).toBeVisible();
});

test("an empty report has nothing to export: every entry is off and says why", async ({ page }) => {
    await page.goto("?data=tickets&start=empty");
    await expect(page.getByTestId("empty-state")).toBeVisible();
    await toolbar(page, "export");
    for (const id of ["export-xlsx", "export-csv", "export-html", "export-png", "export-svg", "export-print", "export-copy-table", "export-copy-json"]) {
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
    await openSaveAs(report);
    await report.getByTestId("saved-view-name").fill("Mine");
    await report.getByTestId("saved-view-name").press("Enter");
    await elementViews(report);
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
    // the focus on Cancel: Enter cancels
    await expect(report.getByTestId("cancel-replace-shared")).toBeFocused();
    await page.keyboard.press("Enter");
    expect(await page.evaluate(() => window.__events)).toEqual([]);
    await report.getByTestId("save-loaded").click();
    await report.getByTestId("confirm-replace-shared").click();
    await expect(report.locator(".pk-toasts")).toContainText("View “Team view” saved");
    const events = await page.evaluate(() => window.__events);
    expect(events.map((e) => [e.type, e.detail.name])).toEqual([["pivot-template-publish", "Team view"]]);
    expect(events[0].detail.view.version).toEqual(expect.any(Number));

    // New, then the Export menu of the empty report: off, and a click sends no pivot-export
    await (await startOver(report, "new-report")).click();
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
    await openSaveAs(report);
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
    await openSaveAs(page);
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
    const both = page.locator('[data-testid="topic-myViews"] [data-testid="saved-view-Dup"]');
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
    await openSaveAs(page);
    await page.getByTestId("saved-view-name").fill("Tmp");
    await page.getByTestId("saved-view-name").press("Enter");
    await expect(page.locator(".pk-toasts")).toContainText("View “Tmp” saved");
    const file = await page.evaluate(() => ({ ...JSON.parse(localStorage.getItem("pivotkit:views:playground"))[0], name: "From a file" }));
    await toolbar(page, "views");
    await page.getByTestId("load-view").click();
    await page.getByTestId("load-view-text").fill(JSON.stringify(file));
    await page.getByTestId("load-view-apply").click();
    await expect(page.getByTestId("view-name")).toHaveText("From a file");
    await toolbar(page, "views");
    await expect(page.getByTestId("save-loaded")).toBeDisabled();
    await expect(page.getByTestId("save-loaded")).toContainText("Not saved yet. Use Save as.");
});

test("web component: a slow save that answers after New or after another view is loaded names neither", async ({ page }) => {
    await page.goto("pages/element-views.html");
    const report = page.locator("#views");
    await report.locator('[data-testid="pivot-table"]').waitFor();
    await page.evaluate(() => {
        const el = document.getElementById("views");
        el.saveTemplates = true;
        el.templates = [...el.templates, { name: "Host mine", view: { rows: ["Region"], values: [{ field: "Units", agg: "sum" }] }, scope: "user" }];
        el.addEventListener("pivot-template-save", (e) => e.detail.respondWith(new Promise((done) => setTimeout(done, 500))));
    });
    // Save as "Slow", then New before the host answers: the empty report gets no name
    await elementViews(report);
    await openSaveAs(report);
    await report.getByTestId("saved-view-name").fill("Slow");
    await report.getByTestId("saved-view-name").press("Enter");
    await page.keyboard.press("Escape");
    await (await startOver(report, "new-report")).click();
    await expect(report.getByTestId("empty-state")).toBeVisible();
    await expect(report.locator(".pk-toasts")).toContainText("View “Slow” saved");
    await expect(report.getByTestId("view-name")).toHaveCount(0);
    // load "Host mine", Save as "Later", then load "Team view" before the answer: it keeps its own name
    await elementViews(report);
    await report.getByTestId("saved-view-Host mine").click();
    await elementViews(report);
    await openSaveAs(report);
    await report.getByTestId("saved-view-name").fill("Later");
    await report.getByTestId("saved-view-name").press("Enter");
    await elementViews(report);
    await report.getByTestId("saved-view-Team view").click();
    await expect(report.locator(".pk-toasts")).toContainText("View “Later” saved");
    await expect(report.getByTestId("view-name")).toHaveText("Team view");
    await expect(report.getByTestId("view-changed")).toHaveCount(0);
});

test("web component: Publish and Save over a shared view hand over the view in the same form, the host's orders included", async ({ page }) => {
    await page.goto("pages/element-views.html");
    const report = page.locator("#views");
    await report.locator('[data-testid="pivot-table"]').waitFor();
    await page.evaluate(() => {
        const el = document.getElementById("views");
        const regions = [...new Set(el.data.map((r) => r.Region))].reverse();
        el.fieldDefaults = { Region: { order: regions } };
        el.sourceId = "sales";
        el.sourceName = "Sales";
        // a user's view of the host without a sort of its own: Publish sends it as the report shows it
        el.templates = [...el.templates, { name: "Plain", view: { rows: ["Region"], values: [{ field: "Units", agg: "sum" }] }, scope: "user" }];
    });
    await elementViews(report);
    await report.getByTestId("publish-view-Plain").click();
    await report.getByTestId("confirm-publish").click();
    await expect(report.locator(".pk-toasts")).toContainText("View “Plain” published");
    // the page made it a shared view; Save over it: the view shown, with the same custom order
    await elementViews(report);
    await report.locator('[data-testid="topic-sharedViews"]').getByTestId("saved-view-Plain").click();
    await elementViews(report);
    await report.getByTestId("save-loaded").click();
    await report.getByTestId("confirm-replace-shared").click();
    await expect.poll(() => page.evaluate(() => window.__events.filter((e) => e.type === "pivot-template-publish").length)).toBe(2);
    const [published, saved] = (await page.evaluate(() => window.__events)).filter((e) => e.type === "pivot-template-publish");
    const regionSort = (v) => v.sort.find((s) => s.field === "Region");
    expect(regionSort(published.detail.view)).toEqual(expect.objectContaining({ by: "custom" }));
    expect(regionSort(saved.detail.view)).toEqual(regionSort(published.detail.view));
    expect(saved.detail.view).toEqual(published.detail.view);
    // a host's view names no data of its own: both carry the data shown, as pivot-template-save does
    expect(published.detail.source).toEqual({ id: "sales", name: "Sales" });
    expect(saved.detail.source).toEqual({ id: "sales", name: "Sales" });
});

test("web component: Publish of a host's view file made for other data hands over the data the file names", async ({ page }) => {
    await page.goto("pages/element-views.html");
    const report = page.locator("#views");
    await report.locator('[data-testid="pivot-table"]').waitFor();
    await page.evaluate(() => {
        const el = document.getElementById("views");
        el.sourceId = "sales";
        el.sourceName = "Sales";
        el.templates = [...el.templates, { file: { format: "pivotkit-view", formatVersion: 2, name: "Of other data", source: { id: "archive" }, view: { rows: ["Region"] } }, scope: "user" }];
    });
    await elementViews(report);
    await report.getByTestId("publish-view-Of other data").click();
    await report.getByTestId("confirm-publish").click();
    await expect.poll(() => page.evaluate(() => window.__events.filter((e) => e.type === "pivot-template-publish").length)).toBe(1);
    const [published] = (await page.evaluate(() => window.__events)).filter((e) => e.type === "pivot-template-publish");
    expect(published.detail.source).toEqual({ id: "archive" });
});

test("the view's name is a button of the toolbar: Tab reaches it, Enter opens Views", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "Safari's Tab skips buttons unless the user turns that on");
    await page.goto("?data=tickets");
    await toolbar(page, "views");
    await page.getByTestId("saved-view-Median lead time by month").click();
    const name = page.getByTestId("view-name");
    await expect(name).toHaveText("Median lead time by month");
    await expect(name).toHaveRole("button");
    await page.getByTestId("undo").focus();
    for (let i = 0; i < 10 && !(await name.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab");
    await expect(name).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("topic-title-thisView")).toBeVisible();
    await expect(page.getByTestId("save-loaded")).toHaveText("Save “Median lead time by month”");
});

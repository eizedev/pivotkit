// A view with parts the report cannot use: a warning above the result in plain words, open the first
// time it shows for a view and foldable, the technical path below each line for developers, German
// too, and the core's short message (or English) when the plain words cannot be loaded. A line goes
// once its part of the view is changed by hand and comes back with Undo (#82); the host's own view
// (defaultView, a controlled view, the element's default-view) is warned about too, once per view (#83).
import { test as plain } from "@playwright/test";
import { chipMenu, expect, openSaveAs, openShare, openZones, test, toolbar } from "./fixtures.js";

/** A view for the sales data with a value whose colour scale has one colour and a legend place the chart does not know. */
const VIEW = {
    rows: ["Region"],
    values: [{ field: "Units", agg: "sum", label: "Quakes", conditional: { type: "colorScale", colors: ["red"] } }],
    chart: { legend: "left" }
};

/** Loads a view as pasted JSON (Views → Share → Load). */
async function paste(page, view) {
    await toolbar(page, "views");
    await openShare(page);
    await page.getByTestId("load-view").click();
    await page.getByTestId("load-view-text").fill(JSON.stringify(view));
    await page.getByTestId("load-view-apply").click();
}

test("a view with unused parts shows a warning, open, each part in plain words with the technical path below", async ({ page }) => {
    await page.goto("?data=sales");
    await paste(page, VIEW);
    const warning = page.getByTestId("view-issues");
    await expect(warning.getByTestId("unused-title")).toHaveText("2 parts of this view could not be used");
    await expect(warning.locator("details")).toHaveAttribute("open", "");
    const items = warning.getByTestId("unused-item");
    await expect(items.first()).toContainText("Quakes: the colour scale needs two or three colours - the default colours are used");
    await expect(items.nth(1)).toContainText("Chart: the legend position “left” is unknown - the default is used");
    // the path and the core's message, small, for developers
    await expect(items.first().getByTestId("unused-path")).toHaveText("For developers: values[0].conditional.colors · two or three colours as #rgb or #rrggbb");
    await expect(items.first().locator("strong")).toHaveText("Quakes");
    // a screen reader hears it once: the status note says the view loaded partly, the live region
    // stays empty; the warning does not take the focus
    await expect(page.locator(".pk-toast").filter({ hasText: "View loaded; some parts did not fit this data" })).toBeVisible();
    await expect(page.getByTestId("unused-live")).toHaveText("");
    expect(await warning.evaluate((el) => el.contains(el.getRootNode().activeElement))).toBe(false);
    // the view's usable parts are there
    await expect(page.getByTestId("pivot-table")).toContainText("North");
});

test("the warning folds by its title, with the mouse and the keyboard, and stays folded for that view", async ({ page }) => {
    await page.goto("?data=sales");
    await paste(page, VIEW);
    const warning = page.getByTestId("view-issues");
    const title = warning.getByTestId("unused-title");
    await expect(warning.getByTestId("unused-item").first()).toBeVisible();
    await title.click();
    await expect(warning.locator("details")).not.toHaveAttribute("open", "");
    await expect(warning.getByTestId("unused-item").first()).toBeHidden();
    // the title stays and says how many parts
    await expect(title).toBeVisible();
    await title.focus();
    await page.keyboard.press("Enter");
    await expect(warning.getByTestId("unused-item").first()).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(warning.getByTestId("unused-item").first()).toBeHidden();
    // a change that keeps the view's unused parts keeps it folded
    await page.getByTestId("swap").click();
    await expect(warning.locator("details")).not.toHaveAttribute("open", "");
    // another view with the same unused parts opens it again
    await paste(page, { ...VIEW, cols: ["Product"] });
    await expect(warning.locator("details")).toHaveAttribute("open", "");
    await paste(page, { rows: ["Region"], values: [{ field: "Units", agg: "sum", format: "money" }] });
    await expect(warning.getByTestId("unused-title")).toHaveText("1 part of this view could not be used");
    await expect(warning.locator("details")).toHaveAttribute("open", "");
    await expect(warning.getByTestId("unused-item")).toContainText("Sum of Units: the number format “money” is unknown - the usual format is used");
    // dismissed, it goes, and the focus goes to what follows it, not back to the top of the report
    await page.getByTestId("dismiss-issues").click();
    await expect(warning).toHaveCount(0);
    const focused = await page.evaluate(() => {
        const el = document.activeElement;
        return { root: el?.classList.contains("pk-root"), inReport: Boolean(el?.closest(".pk-root")), testid: el?.getAttribute("data-testid") ?? el?.className };
    });
    expect(focused.root).toBe(false);
    expect(focused.inReport).toBe(true);
});

test("in German, the warning and its lines are German", async ({ page }) => {
    await page.goto("?data=sales&lang=de");
    await paste(page, VIEW);
    const warning = page.getByTestId("view-issues");
    await expect(warning.getByTestId("unused-title")).toHaveText("2 Teile dieser Ansicht konnten nicht verwendet werden");
    await expect(warning.getByTestId("unused-item").first()).toContainText("Quakes: die Farbskala braucht zwei oder drei Farben - die Standardfarben werden verwendet");
    await expect(warning.getByTestId("unused-item").nth(1)).toContainText("Diagramm: Legendenposition „left“ ist unbekannt - die Voreinstellung gilt");
    await expect(warning.getByTestId("unused-path").first()).toContainText("Für Entwickler: values[0].conditional.colors");
});

// a host that did not deploy the chunks, or a connection that drops: the core's short messages stay
// (the failed request is a console error, so these tests do not use the fixture that fails on one)
plain("without the plain words, each line keeps the core's short message and its path", async ({ page }) => {
    await page.route(/\/chunks\/unused-texts-[^/]+\.js$/, (route) => route.abort());
    await page.goto("?data=sales");
    await paste(page, VIEW);
    const warning = page.getByTestId("view-issues");
    await expect(warning.getByTestId("unused-title")).toHaveText("2 parts of this view could not be used");
    const first = warning.getByTestId("unused-item").first();
    await expect(first).toContainText("two or three colours as #rgb or #rrggbb");
    await expect(first.getByTestId("unused-path")).toHaveText("For developers: values[0].conditional.colors");
    await expect(first.locator("strong")).toHaveCount(0);
});

plain("without the German texts, a German report says its unused parts in English", async ({ page }) => {
    await page.route(/\/chunks\/unused-texts-de-[^/]+\.js$/, (route) => route.abort());
    await page.goto("?data=sales&lang=de");
    await paste(page, VIEW);
    const warning = page.getByTestId("view-issues");
    // the title is part of the first load: German
    await expect(warning.getByTestId("unused-title")).toHaveText("2 Teile dieser Ansicht konnten nicht verwendet werden");
    await expect(warning.getByTestId("unused-item").first()).toContainText("Quakes: the colour scale needs two or three colours - the default colours are used");
});

/** A view for the sales data with nine parts the report cannot use, two values of one name among them. */
const MANY = {
    rows: ["Region", "Planet", "Moon"],
    values: [{ field: "Units", agg: "sum", format: "money" }, { field: "Units", agg: "sum", conditional: { type: "colorScale", colors: ["red"] } }, { field: "Nope", agg: "sum" }],
    filters: [{ field: "Gone", type: "include", items: ["x"] }],
    chart: { legend: "left", type: "radar", axisLabels: "some" }
};

test("a saved view with many unused parts shows the first three, the rest on a button; said once", async ({ page }) => {
    await page.goto("?data=sales");
    await toolbar(page, "views");
    await openSaveAs(page);
    await page.getByTestId("saved-view-name").fill("Many");
    await page.getByTestId("saved-view-name").press("Enter");
    await expect(page.locator(".pk-toasts")).toContainText("View “Many” saved");
    // the stored view, made for other fields (an older data set, another program)
    await page.evaluate((view) => {
        const [mine] = JSON.parse(localStorage.getItem("pivotkit:views:playground"));
        localStorage.setItem("pivotkit:views:playground", JSON.stringify([{ ...mine, view }]));
    }, MANY);
    await page.reload();
    await toolbar(page, "views");
    await page.locator('[data-testid="topic-myViews"] [data-testid="saved-view-Many"]').click();
    const warning = page.getByTestId("view-issues");
    await expect(warning.getByTestId("unused-title")).toHaveText("9 parts of this view could not be used");
    const items = warning.getByTestId("unused-item");
    await expect(items.first()).toContainText("Planet: the data has no field of this name - it is left out of Rows");
    await expect(items).toHaveCount(3);
    // the status note names the view; the live region says the title, once
    await expect(page.getByTestId("unused-live")).toHaveText("9 parts of this view could not be used");
    const more = warning.getByTestId("unused-more");
    await expect(more).toHaveText("Show 6 more");
    await more.focus();
    await page.keyboard.press("Enter");
    await expect(items).toHaveCount(9);
    await expect(more).toHaveText("Show fewer");
    await expect(more).toBeFocused();
    // two values with the same name: each says which one it is
    await expect(warning).toContainText("Sum of Units (no. 1 in Values): the number format “money” is unknown");
    await expect(warning).toContainText("Sum of Units (no. 2 in Values): the colour scale needs two or three colours");
    await more.click();
    await expect(items).toHaveCount(3);
});

test("a narrow report shows the first two lines of a long warning", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("?data=sales");
    await paste(page, MANY);
    await page.getByTestId("load-anyway").click();
    const warning = page.getByTestId("view-issues");
    await expect(warning.getByTestId("unused-item")).toHaveCount(2);
    await expect(warning.getByTestId("unused-more")).toHaveText("Show 7 more");
    const box = await warning.boundingBox();
    expect(box?.height ?? 999).toBeLessThan(330);
});

test("a line goes once its part of the view is changed by hand, and comes back with Undo (#82)", async ({ page }) => {
    await page.goto("?data=sales");
    await paste(page, VIEW);
    const warning = page.getByTestId("view-issues");
    await expect(warning.getByTestId("unused-title")).toHaveText("2 parts of this view could not be used");
    // the value whose colour scale did not fit is removed: its line goes, the legend's stays
    await chipMenu(page, "Quakes");
    await page.locator(".pk-chip-menu").getByTestId("menu-remove").click();
    await expect(warning.getByTestId("unused-title")).toHaveText("1 part of this view could not be used");
    await expect(warning.getByTestId("unused-item")).toHaveCount(1);
    await expect(warning.getByTestId("unused-item")).toContainText("Chart: the legend position “left” is unknown");
    // Undo brings the value and its line back
    await page.getByTestId("undo").click();
    await expect(warning.getByTestId("unused-title")).toHaveText("2 parts of this view could not be used");
    await expect(warning.getByTestId("unused-item").first()).toContainText("Quakes: the colour scale needs two or three colours");
});

test.describe("the host's own view (#83)", () => {
    for (const [name, url] of [
        ["defaultView of pivotkit-react", "pages/nav.html?view=broken"],
        ["default-view of the web component", "pages/element-nav.html?view=broken"]
    ]) {
        test(`${name}: what the data cannot use is said above the result, in words, aloud once`, async ({ page }) => {
            await page.goto(url);
            const report = page.locator("#one");
            const warning = report.getByTestId("view-issues");
            await expect(warning.getByTestId("unused-title")).toHaveText("2 parts of this view could not be used");
            await expect(warning.getByTestId("unused-item").first()).toContainText("Hostname: the data has no field of this name - it is left out of Rows");
            await expect(warning.getByTestId("unused-item").nth(1)).toContainText("Sum of Cost: the number format “money” is unknown");
            // no status note said it: the live region does
            await expect(report.getByTestId("unused-live")).toHaveText("2 parts of this view could not be used");
            // the value with the unknown format, its format chosen by hand: its line goes
            await openZones(page);
            await report.getByTestId("chip-menu-Sum of Cost").click();
            await report.locator(".pk-chip-menu").getByTestId("menu-remove").click();
            await expect(warning.getByTestId("unused-title")).toHaveText("1 part of this view could not be used");
        });
    }

    test("a controlled view the host gives on every render: the warning shows once, stays dismissed, and goes with the user's change", async ({ page }) => {
        await page.goto("pages/host.html?broken");
        const warning = page.getByTestId("view-issues");
        await expect(warning.getByTestId("unused-title")).toHaveText("2 parts of this view could not be used");
        // folded, it stays folded while the host renders again and again (every 200 ms)
        await warning.getByTestId("unused-title").click();
        await expect(warning.locator("details")).not.toHaveAttribute("open", "");
        const renders = Number(await page.getByTestId("host-renders").textContent());
        await expect.poll(async () => Number(await page.getByTestId("host-renders").textContent())).toBeGreaterThan(renders + 3);
        await expect(warning.locator("details")).not.toHaveAttribute("open", "");
        // dismissed, it stays away over the host's renders
        await page.getByTestId("dismiss-issues").click();
        await expect(warning).toHaveCount(0);
        const later = Number(await page.getByTestId("host-renders").textContent());
        await expect.poll(async () => Number(await page.getByTestId("host-renders").textContent())).toBeGreaterThan(later + 3);
        await expect(warning).toHaveCount(0);
    });

    test("a controlled view: the user's change ends the warning, as the host gives back the view it got", async ({ page }) => {
        await page.goto("pages/host.html?broken");
        const warning = page.getByTestId("view-issues");
        await expect(warning.getByTestId("unused-title")).toHaveText("2 parts of this view could not be used");
        await openZones(page);
        await page.getByTestId("swap").click();
        await expect(warning).toHaveCount(0);
    });
});

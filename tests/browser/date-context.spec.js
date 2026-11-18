import { readFile } from "node:fs/promises";
import { toViewFile } from "pivotkit-core";
import { encodeViewLink } from "pivotkit-core/link";
import { test, expect, openZones } from "./fixtures.js";
for (const lang of ["en", "de"]) {
    test(`weather date context and Group level (${lang}) #109`, async ({page}) => {
        await page.goto(`?data=weather&preset=0&lang=${lang}`);
        await openZones(page);
        await expect(page.getByTestId("date-range")).toContainText("2023");
        await expect(page.getByTestId("date-range")).toContainText("2025");
        // the range is the data's, before filters: its tooltip says so
        await expect(page.getByTestId("date-range")).toHaveAttribute("title", lang === "en" ? "Date: the data's first and last date, before filters" : "Date: erstes und letztes Datum der Daten, vor den Filtern");
        const years = lang === "en" ? "2023–2025 combined" : "2023–2025 zusammengefasst";
        // the table's title names the years; the chip keeps the plain name, its tooltip has the years
        await expect(page.getByTestId("pivot-table")).toContainText(years);
        const chip = page.locator('[data-zone="cols"] .pk-chip');
        await expect(chip.locator(".pk-chip-name")).not.toContainText(years);
        await expect(chip.locator("[title]").first()).toHaveAttribute("title", new RegExp(years));
        await page.locator('[data-zone="cols"] [data-testid^="chip-menu-"]').click();
        await page.getByTestId("topic-group").click();
        const menu = page.locator(".pk-chip-menu");
        await expect(menu).toContainText(lang === "en" ? "Data:" : "Daten:");
        await expect(menu).toContainText(lang === "en" ? "One item per period" : "Ein Eintrag pro Zeitraum");
        await expect(menu).toContainText(lang === "en" ? "3 years together" : "3 Jahre zusammen");
    });
}

test("a single weather year labels cyclic items, not combined years #109", async ({page}) => {
    const view = {rows: ["Month"], derived: [{name: "Month", field: "Date", by: "month"}], values: [{field: "Mean °C", agg: "average"}], filters: [{field: "Date", type: "compare", op: ">=", value: "2025-01-01"}]};
    const hash = encodeViewLink(toViewFile(view, {}, {link: true}));
    await page.goto(`?data=weather&empty#pivot-playground=${hash}`);
    await expect(page.getByTestId("pivot-table")).toContainText("Jan 2025");
    await expect(page.getByTestId("pivot-table")).not.toContainText("combined");
    await expect(page.getByTestId("date-range")).toContainText("2023");
});

test("cyclic chip IDs stay stable and downloaded headers omit display-only year context #109", async ({page}) => {
    await page.goto("?data=weather&preset=0");
    await openZones(page);
    await page.getByTestId("chip-menu-Date by month of year").click();
    await expect(page.locator(".pk-chip-menu")).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByTestId("export").click();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-csv").click()]);
    const text = await readFile(await download.path(), "utf8");
    expect(text).not.toContain("combined");
    expect(text).toContain("Date by month of year");
});

test("the export writes the plain items, as the command line does, while the table shows the year #109", async ({page}) => {
    const view = {rows: ["Month"], derived: [{name: "Month", field: "Date", by: "month"}], values: [{field: "Mean °C", agg: "average"}], filters: [{field: "Date", type: "compare", op: ">=", value: "2025-01-01"}]};
    const hash = encodeViewLink(toViewFile(view, {}, {link: true}));
    await page.goto(`?data=weather&empty#pivot-playground=${hash}`);
    await expect(page.getByTestId("pivot-table")).toContainText("Jan 2025");
    await page.getByTestId("export").click();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-csv").click()]);
    const text = await readFile(await download.path(), "utf8");
    expect(text).not.toContain("2025");
    expect(text).toMatch(/^"?Jan"?,/m);
});

test("one year by weekday: plain items, the year in the title #109", async ({page}) => {
    const view = {rows: ["Weekday"], derived: [{name: "Weekday", field: "Date", by: "weekday"}], values: [{field: "Mean °C", agg: "average"}], filters: [{field: "Date", type: "compare", op: ">=", value: "2025-01-01"}]};
    const hash = encodeViewLink(toViewFile(view, {}, {link: true}));
    await page.goto(`?data=weather&empty#pivot-playground=${hash}`);
    const table = page.getByTestId("pivot-table");
    await expect(table).toContainText("Weekday · 2025 only");
    await expect(table).toContainText("Mon");
    await expect(table).not.toContainText("Mon 2025");
});

test("field information and footer use the loaded view locale #109", async ({page}) => {
    const view = {rows:["Date"], values:[{agg:"count"}], formatting:{locale:"de-DE"}};
    const hash = encodeViewLink(toViewFile(view, {}, {link:true}));
    await page.goto(`?data=weather&empty#pivot-playground=${hash}`);
    const expected = new Intl.DateTimeFormat("de-DE", {year:"numeric", month:"short", day:"numeric", timeZone:"UTC"}).format(Date.UTC(2023,0,1));
    await expect(page.getByTestId("date-range")).toContainText(expected);
    await page.locator('.pk-field[data-field="Date"]').getByTestId("field-info").click();
    await expect(page.locator(".pk-popover")).toContainText(expected);
});

for (const theme of ["light", "dark"]) {
    for (const width of [1280, 390]) {
        test(`date context review screenshot ${theme} ${width} #109`, async ({page}, info) => {
            test.skip(info.project.name !== "chromium", "Layout captures only; behaviour covered in all engines");
            await page.setViewportSize({width, height:900});
            await page.goto(`?data=weather&preset=0&theme=${theme}`);
            await openZones(page);
            await page.locator('[data-zone="cols"] [data-testid^="chip-menu-"]').click();
            await page.getByTestId("topic-group").click();
            await expect(page.locator(".pk-chip-menu")).toContainText("3 years together");
            await page.screenshot({path:info.outputPath(`group-${theme}-${width}.png`),fullPage:true});
        });
    }
}

test("enlarged summary retains cyclic context and Group introduction describes its menu #109", async ({page}) => {
    await page.goto("?data=weather&preset=0");
    await page.getByTestId("enlarge").click();
    await expect(page.getByTestId("enlarged-fields")).toContainText("2023–2025 combined");
    await page.getByTestId("enlarge").click();
    await openZones(page);
    await page.getByTestId("chip-menu-Date by month of year").click();
    await page.getByTestId("topic-group").click();
    const menu = page.getByTestId("level-group").getByRole("menu");
    await expect(menu).toHaveAttribute("aria-describedby", /intro$/);
    await expect(menu.locator(":scope > p.pk-field-desc")).toHaveCount(0);
    await expect(menu).toHaveAccessibleDescription(/2023/);
});


test("computed date info alone keeps the user explanation switch available #109", async ({page}) => {
    await page.goto("pages/element-views.html");
    const host = page.locator("#views");
    await expect(host.locator(".pk-root")).toBeVisible();
    await host.evaluate(el => {
        el.defaultView = {rows: ["Date"], values: [{field: "Amount", agg: "sum"}]};
        el.data = [{Date: "2019-06-01", Amount: 1}];
        el.settingInfo = "on";
        el.zoneInfo = "on";
        el.fieldInfo = undefined;
    });
    await expect(host.locator('.pk-field[data-field="Date"] .pk-info')).toHaveCount(1);
    // Show explanations sits in More › Help
    await host.getByTestId("more").click();
    await host.getByTestId("more-help").click();
    await expect(host.getByTestId("show-explanations")).toBeVisible();
    await host.getByTestId("show-explanations").click();
    await page.keyboard.press("Escape");
    await expect(host.locator('.pk-field[data-field="Date"] .pk-info')).toHaveCount(0);
});

test("single cyclic month shows observed non-Gregorian endpoints; the export keeps the plain item #109", async ({page}) => {
    const locale = "en-US-u-ca-islamic-civil";
    const view = {rows:["Month"], derived:[{name:"Month",field:"Date",by:"month"}], values:[{field:"Mean °C",agg:"average"}], formatting:{locale}, filters:[{field:"Date",type:"compare",op:">=",value:"2025-01-01"},{field:"Date",type:"compare",op:"<=",value:"2025-01-31"}]};
    const hash = encodeViewLink(toViewFile(view, {}, {link:true}));
    await page.goto(`?data=weather&empty#pivot-playground=${hash}`);
    // the browser's own ICU names the months: WebKit on macOS abbreviates them unlike Node's
    const [first, last] = await page.evaluate((loc) => {
        const fmt = new Intl.DateTimeFormat(loc, {month: "short", year: "numeric", timeZone: "UTC"});
        return [fmt.format(Date.UTC(2025, 0, 1)), fmt.format(Date.UTC(2025, 0, 31))];
    }, locale);
    await expect(page.getByTestId("pivot-table")).toContainText(`${first} – ${last}`);
    await page.getByTestId("export").click();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-csv").click()]);
    const text = await readFile(await download.path(), "utf8");
    // the file holds pivotkit-core's item, as the command line and the server write it
    expect(text).not.toContain(`${first} – ${last}`);
    expect(text.trim().split(/\r?\n/)).toHaveLength(3);
});


test("combined cyclic months display Gregorian grouping keys in other calendars; the export keeps the plain items #109", async ({page}) => {
    const locale = "en-US-u-ca-islamic-civil";
    const view = {rows:["Month"], derived:[{name:"Month",field:"Date",by:"month"}], values:[{field:"Mean °C",agg:"average"}], formatting:{locale}, filters:[{field:"Date",type:"compare",op:">=",value:"2025-01-01"},{field:"Date",type:"compare",op:"<=",value:"2025-12-31"}]};
    const hash = encodeViewLink(toViewFile(view, {}, {link:true}));
    await page.goto(`?data=weather&empty#pivot-playground=${hash}`);
    await expect(page.getByTestId("pivot-table")).toContainText("combined");
    await expect(page.getByTestId("pivot-table")).toContainText("Jan");
    await expect(page.getByTestId("pivot-table")).toContainText("Aug");
    await page.getByTestId("export").click();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-csv").click()]);
    const text = await readFile(await download.path(), "utf8");
    // pivotkit-core's items and the field's plain name, as the command line and the server write them
    expect(text).not.toContain("combined");
    expect(text.trim().split(/\r?\n/)).toHaveLength(14);
});

test("drill title retains combined cyclic field context #109", async ({page}) => {
    await page.goto("?data=weather&preset=0");
    await page.locator('[data-testid="pivot-table"] td.pk-clickable').first().click();
    await expect(page.getByTestId("drill-panel")).toContainText("2023–2025 combined");
});

test("invalid host locale keeps date Group menus usable after controlled failure #109", async ({page}) => {
    await page.goto("pages/element-views.html");
    const host = page.locator("#views");
    await expect(host.locator(".pk-root")).toBeVisible();
    await host.evaluate(el => {
        el.defaultView = {rows:["Date"],values:[{field:"Amount",agg:"sum"}]};
        el.data = [{Date:"2024-01-01",Amount:1}];
        el.locale = "invalid_locale";
    });
    await expect(host.getByRole("alert")).toBeVisible();
    await openZones(page);
    await host.getByTestId("chip-menu-Date").click();
    await host.getByTestId("topic-group").click();
    await expect(host.getByTestId("group-year")).toBeVisible();
});

test("historical Month grouping hints retain the actual century #109", async ({page}) => {
    await page.goto("pages/element-views.html");
    const host = page.locator("#views");
    await expect(host.locator(".pk-root")).toBeVisible();
    await host.evaluate(el => {
        el.defaultView = {rows:["Date"],values:[{field:"Amount",agg:"sum"}]};
        el.data = [{Date:"0001-02-15",Amount:1},{Date:"0099-11-20",Amount:2}];
        el.locale = "en-US";
    });
    await openZones(page);
    await host.getByTestId("chip-menu-Date").click();
    await host.getByTestId("topic-group").click();
    await expect(host.getByTestId("group-yearMonth")).toContainText("Feb 1 … Nov 99 (1186)");
    await expect(host.getByTestId("group-yearMonth")).not.toContainText("1901");
});

// What a business user sees: words instead of bare icons, notes that explain, charts that stay
// readable. Every test here fails without its fix.
import { chips, expect, openZones, tableRows, test, toolbar } from "./fixtures.js";

test("narrow: every toolbar button keeps its text; the rest is in a labelled More menu", async ({ page }) => {
    for (const width of [640, 390]) {
        await page.setViewportSize({ width, height: 844 });
        await page.goto("?data=sales");
        const buttons = page.locator(".pk-toolbar button");
        const texts = await buttons.evaluateAll((els) => els.filter((e) => e.getClientRects().length).map((e) => e.textContent.trim()));
        expect(texts.every((t) => t.length > 0), `${width}: ${JSON.stringify(texts)}`).toBe(true);
        // Redo stays next to Undo
        for (const name of ["Table", "Chart", "Undo", "Redo", "Export", "More"]) {
            expect(texts.some((t) => t.startsWith(name)), `${width}: ${name}`).toBe(true);
        }
        await page.getByTestId("more").click();
        await expect(page.getByRole("menuitem", { name: "Options…" })).toBeVisible();
        await page.keyboard.press("Escape");
    }
});

test("wide German toolbar fits on one line", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("?data=sales&lang=de");
    const tops = await page.locator(".pk-toolbar > :is(button, div)").evaluateAll((els) => [...new Set(els.map((e) => Math.round(e.getBoundingClientRect().top)))]);
    expect(tops).toHaveLength(1);
});

test("a chart with many series says so and swaps rows and columns", async ({ page }) => {
    await page.goto("?data=sales&empty");
    await page.getByTestId("field-menu-Category").click();
    await page.getByRole("menuitem", { name: "Add to Rows" }).click();
    await page.getByTestId("field-menu-Country").click();
    await page.getByRole("menuitem", { name: "Add to Columns" }).click();
    await page.locator('.pk-field[data-field="Revenue"] .pk-field-name').click();
    await page.getByTestId("show-chart").click();
    const hint = page.locator('[data-tip="chartSeries"]');
    await expect(hint).toContainText("series are hard to tell apart");
    await hint.getByRole("button", { name: "Swap rows and columns" }).click();
    await expect.poll(() => chips(page, "rows")).toEqual(["Country"]);
    await expect.poll(() => chips(page, "cols")).toEqual(["Category"]);
    await expect(page.locator('[data-tip="chartSeries"]')).toHaveCount(0);
});

test("lines with the dates on Columns get a hint to swap", async ({ page }) => {
    await page.goto("?data=tickets&empty");
    await page.getByTestId("field-menu-Team").click();
    await page.getByRole("menuitem", { name: "Add to Rows" }).click();
    await page.getByTestId("field-menu-Created").click();
    await page.getByRole("menuitem", { name: "Add to Columns" }).click();
    await page.locator('.pk-field[data-field="Lead hours"] .pk-field-name').click();
    await toolbar(page, "chart-type");
    await page.getByTestId("chart-line").click();
    await expect(page.locator('[data-tip="chartDates"]')).toBeVisible();
    await page.locator('[data-tip="chartDates"]').getByRole("button", { name: "Swap rows and columns" }).click();
    await expect.poll(() => chips(page, "rows")).toEqual(["Created by month"]);
});

test("a chart draws 50 categories at most and says so", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("?data=tickets&rows=100000&empty");
    await page.getByTestId("field-menu-Ticket").click();
    await page.getByRole("menuitem", { name: "Add to Rows" }).click();
    await page.locator('.pk-field[data-field="Lead hours"] .pk-field-name').click();
    await page.getByTestId("show-chart").click();
    await expect(page.locator('[data-tip="chartCapped"]')).toHaveText("Showing the first 50 of 100,000 categories. Add a filter or Top N to choose them.");
});

test("top N: its own badge on the chip and a note that totals cover the shown items only", async ({ page }) => {
    await page.goto("?data=sales");
    await page.getByTestId("chip-menu-Country").click();
    await page.getByTestId("top-count").fill("2");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.locator('[data-zone="rows"] .pk-chip[data-chip="Country"] [data-testid="top-badge"]')).toHaveText("Top 2");
    await expect(page.getByTestId("tip-top")).toHaveText("Country shows the top 2 only: totals and percentages cover these items, not all of them.");
});

test("a chip on a phone keeps its badges whole and a few characters of the field's name", async ({ page }) => {
    // the chips with the longest badges of the end-of-life templates: "Top 10" and a sort, "15 of 45"
    for (const [preset, field] of [[1, "Product"], [0, "EOL date by year"]]) {
        for (const [width, lang] of [[390, "en"], [320, "en"], [390, "de"], [320, "de"]]) {
            // a report high enough for its stacked zones open, in a window that holds it (no page
            // scrollbar takes width from the chips)
            await page.setViewportSize({ width, height: 2200 });
            await page.goto(`?data=endoflife&preset=${preset}&lang=${lang}&height=2000`);
            // the stacked zones of a phone need more room than some of these reports have: opened by hand
            await openZones(page);
            const text = page.locator(`[data-zone="rows"] .pk-chip[data-chip="${field}"] .pk-chip-label .pk-btn-text`);
            // measured once the layout has settled (the report measures its least height after the first render)
            const measure = () => text.evaluate((el) => {
                const t = el.getBoundingClientRect();
                const chip = el.closest(".pk-chip").getBoundingClientRect();
                const badges = [...el.querySelectorAll(".pk-badge-text")];
                const name = el.querySelector(".pk-chip-name");
                return {
                    badges: badges.length > 0 && badges.every((b) => b.getBoundingClientRect().right <= t.right + 0.5 && b.scrollWidth <= b.clientWidth),
                    inChip: t.right <= chip.right + 0.5,
                    // a name that does not fit ends in an ellipsis, and some of it is always there
                    name: name.clientWidth >= 20 && (name.scrollWidth <= name.clientWidth || getComputedStyle(name).textOverflow === "ellipsis")
                };
            });
            await expect.poll(measure, { message: `preset ${preset}, ${width} px, ${lang}` }).toEqual({ badges: true, inChip: true, name: true });
        }
    }
});

test("Rows without Values: a note says what to do; one value column is not stretched", async ({ page }) => {
    await page.goto("?data=sales");
    await page.getByRole("button", { name: "Remove Sum of Revenue" }).click();
    await expect(page.getByTestId("tip-values")).toContainText("Add a number to Values");
    await page.getByRole("button", { name: "Remove Category" }).click();
    await page.keyboard.press("ControlOrMeta+z");
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(() => chips(page, "values")).toEqual(["Sum of Revenue"]);
    await page.getByRole("button", { name: "Remove Category" }).click();
    const wrap = await page.getByTestId("pivot-table").boundingBox();
    const table = await page.locator(".pk-table").boundingBox();
    expect(table.width).toBeLessThan(wrap.width * 0.8);
});

test("a filtered field says how many of its values are shown", async ({ page }) => {
    await page.goto("?data=sales");
    await page.getByTestId("chip-menu-Region").click();
    await page.getByTestId("open-filter").click();
    const total = await page.locator(".pk-value").count();
    await page.locator(".pk-value", { hasText: "West" }).locator("input").uncheck();
    await page.getByTestId("filter-apply").click();
    await expect(page.locator('[data-zone="rows"] .pk-chip[data-chip="Region"] .pk-badge-text')).toHaveText(`${total - 1} of ${total}`);
});

test("text from the data is never markup: table, filter list, drill-down and chart summary", async ({ page }) => {
    await page.goto("?data=markup");
    await expect(page.getByTestId("pivot-table")).toContainText("<img src=x onerror=window.__pwned=1>");
    expect((await tableRows(page)).length).toBeGreaterThan(0);
    await page.locator('[data-testid="pivot-table"] tbody tr', { hasText: "<img" }).locator("td.pk-clickable").first().click();
    await expect(page.getByTestId("drill-panel")).toContainText("<img src=x onerror=window.__pwned=1>");
    await page.keyboard.press("Escape");
    await page.getByTestId("show-chart").click();
    await expect(page.getByTestId("chart-summary")).toContainText("<img");
    await page.locator('[data-testid="pivot-chart"] canvas').hover({ position: { x: 200, y: 150 } });
    expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
    expect(await page.locator(".pk-root img, .pk-root script").count()).toBe(0);
});

test("a panel opened from More keeps the focus on a switch; it closes when its button fits again", async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 900 });
    await page.goto("?data=sales");
    await page.getByTestId("more").click();
    await page.getByTestId("more-options").click();
    // the panel has taken the focus (on its first option) before the user moves it
    await expect.poll(() => page.evaluate(() => Boolean(document.activeElement?.closest(".pk-popover")))).toBe(true);
    const sw = page.getByTestId("total-rowSubtotals");
    await sw.focus();
    await page.keyboard.press("Space");
    await expect(sw).not.toBeChecked();
    await page.waitForTimeout(300);
    await expect(sw).toBeFocused();
    // wider: Options is a button of its own again, the panel of the More menu goes
    await page.setViewportSize({ width: 1920, height: 900 });
    await expect(page.getByTestId("options")).toBeVisible();
    await expect(page.locator(".pk-popover")).toHaveCount(0);
});

test("the drill-down shows dates as dates, numbers in the locale and identifiers as they are", async ({ page }) => {
    for (const [lang, date, cost] of [["en", /^[A-Z][a-z]{2} \d{1,2}, \d{4}$/, /^€[\d,]+\.\d\d$/], ["de", /^\d{2}\.\d{2}\.\d{4}$/, /^[\d.]+,\d\d\u00a0€$/]]) {
        await page.goto(`?data=assets&lang=${lang}`);
        await page.locator('[data-testid="pivot-table"] td.pk-clickable').first().click();
        const panel = page.getByTestId("drill-panel");
        await expect(panel).toBeVisible();
        const table = await panel.locator("table").evaluate((t) => {
            const names = [...t.querySelectorAll("thead th")].map((th) => th.textContent);
            const first = [...t.querySelector("tbody tr").children].map((td) => td.textContent);
            return Object.fromEntries(names.map((n, i) => [n, first[i]]));
        });
        // the playground's fieldDefaults: "Inventory number" drillFormat "text", Cost a currency
        expect(table["Inventory number"]).toMatch(/^4\d{4}$/);
        expect(table.Purchased).toMatch(date);
        expect(table.Cost).toMatch(cost);
        expect(table["Disk GB"]).toMatch(/^\d[\d,.]*$/);
    }
});

test("a half-width report (650 px) stacks its zones; nothing in them is cut, in English and German", async ({ page }) => {
    for (const lang of ["en", "de"]) {
        // the playground's report is the window's width less 40 px
        await page.setViewportSize({ width: 690, height: 900 });
        // the report's default height: low for its stacked zones, so it starts folded; Layout opens them
        await page.goto(`?data=tickets&lang=${lang}&height=640`);
        await expect(page.locator(".pk-root")).toHaveAttribute("data-pk-size", "medium");
        await page.getByTestId("layout-summary").click();
        const zones = page.locator(".pk-zone");
        await expect.poll(() => zones.evaluateAll((els) => new Set(els.map((e) => Math.round(e.getBoundingClientRect().x))).size)).toBe(1);
        // every chip and the swap button lie inside their zone, and no text is cut
        const cut = await page.locator(".pk-zone").evaluateAll((els) =>
            els.flatMap((zone) => {
                const z = zone.getBoundingClientRect();
                return [...zone.querySelectorAll(".pk-chip, .pk-swap")].filter((el) => {
                    const r = el.getBoundingClientRect();
                    const text = el.querySelector(".pk-btn-text");
                    return r.left < z.left || r.right > z.right + 0.5 || (text && text.scrollWidth > text.clientWidth + 1);
                }).map((el) => el.textContent);
            })
        );
        expect(cut, lang).toEqual([]);
        await expect(page.getByTestId("swap")).toHaveAccessibleName(lang === "de" ? "Zeilen und Spalten tauschen" : "Swap rows and columns");
    }
});

test("where the Columns zone is too narrow, the swap button is an icon with its name and a tooltip", async ({ page }) => {
    await page.setViewportSize({ width: 340, height: 2200 });
    await page.goto("?data=tickets&lang=de&height=2000");
    // a phone's stacked zones may need more than the box: opened by hand
    await openZones(page);
    const swap = page.getByTestId("swap");
    await expect(swap).toHaveAccessibleName("Zeilen und Spalten tauschen");
    await expect(swap).toHaveAttribute("title", "Zeilen und Spalten tauschen");
    const box = await swap.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(24);
    expect(box.height).toBeGreaterThanOrEqual(24);
    const head = await page.locator(".pk-zone-cols .pk-zone-head").boundingBox();
    expect(box.x + box.width).toBeLessThanOrEqual(head.x + head.width + 0.5);
});

test("a low report (520 px) folds its zones into one line; Layout and the line open them, a drag still drops", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("?data=tickets&height=520");
    const line = page.getByTestId("layout-summary");
    await expect(line).toHaveText(/Rows: Team · Columns: Priority · Values: Count of Ticket/);
    await expect(line).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator(".pk-zone")).toHaveCount(0);
    // more of the table in view than with the zones open (compared below)
    const rowsInView = () => page.locator('[data-testid="pivot-table"] tbody tr[data-r]').evaluateAll((trs) => {
        const box = document.querySelector('[data-testid="pivot-table"]').getBoundingClientRect();
        return trs.filter((tr) => tr.getBoundingClientRect().bottom <= box.bottom + 1).length;
    });
    const rowsFolded = await rowsInView();
    expect(rowsFolded).toBeGreaterThanOrEqual(4);
    // a field dragged from the list opens the zones while it is dragged
    const from = await page.locator('.pk-field[data-field="Channel"]').boundingBox();
    await page.mouse.move(from.x + 30, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + 60, from.y + 30, { steps: 6 });
    const filters = page.locator('[data-zone="filters"]');
    await expect(filters).toBeVisible();
    const to = await filters.boundingBox();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 16 });
    await page.mouse.move(to.x + to.width / 2 + 1, to.y + to.height / 2 + 1, { steps: 2 });
    await page.mouse.up();
    await page.waitForTimeout(100);
    await expect(line).toHaveText(/Filters: Channel/);
    // the line opens them and the focus goes to the first zone
    await line.click();
    await expect(page.locator(".pk-zone")).toHaveCount(4);
    await expect(page.locator('[data-zone="filters"]')).toBeFocused();
    await expect.poll(rowsInView).toBeLessThan(rowsFolded);
    // Layout in the toolbar (or in More) folds them again; the choice holds
    await page.setViewportSize({ width: 1920, height: 800 });
    const layout = page.getByTestId("layout");
    await expect(layout).toHaveAttribute("aria-pressed", "true");
    // from the keyboard (WebKit does not focus a button on a click): the focus stays on the button
    await layout.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("layout-summary")).toBeVisible();
    await expect(layout).toHaveAttribute("aria-pressed", "false");
    await expect(layout).toBeFocused();
});

test("Layout keeps its text and its place: pressed or not, it never moves into More by itself", async ({ page }) => {
    for (const width of [1600, 1000]) {
        await page.setViewportSize({ width, height: 800 });
        await page.goto("?data=tickets&height=700");
        const where = async () => ((await page.getByTestId("layout").count()) ? "toolbar" : "more");
        const before = await where();
        const flip = async () => {
            if (before === "toolbar") {
                await page.getByTestId("layout").click();
            } else {
                await page.getByTestId("more").click();
                await page.getByTestId("more-layout").click();
            }
        };
        await flip();
        await expect(page.getByTestId("layout-summary")).toBeVisible();
        expect(await where(), `at ${width} px`).toBe(before);
        if (before === "toolbar") {
            await expect(page.getByTestId("layout")).toHaveText("Layout");
            await expect(page.getByTestId("layout")).toHaveAttribute("aria-pressed", "false");
        } else {
            // in More it is the same entry, checked or not
            await page.getByTestId("more").click();
            await expect(page.getByTestId("more-layout")).toHaveText("Layout");
            await expect(page.getByTestId("more-layout")).toHaveAttribute("aria-checked", "false");
            await page.keyboard.press("Escape");
        }
        await flip();
        await expect(page.locator(".pk-zone")).toHaveCount(4);
        expect(await where()).toBe(before);
    }
});

test("a report that gets lower while a chip menu is open folds after the menu closes; the focus goes to the line", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("?data=tickets&height=720");
    const root = page.locator(".pk-root");
    await page.getByTestId("chip-menu-Team").click();
    const menu = page.locator(".pk-popover");
    await expect(menu).toBeVisible();
    // the host makes the report lower (a card resized); React does not touch the style again
    await root.evaluate((el) => {
        el.style.height = "500px";
    });
    await page.waitForTimeout(400);
    await expect(menu).toBeVisible();
    await expect(page.locator(".pk-zone")).toHaveCount(4);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("layout-summary")).toBeVisible();
    await expect(page.getByTestId("layout-summary")).toBeFocused();
});

test("a tall report starts with its zones open", async ({ page }) => {
    await page.goto("?data=tickets&height=720");
    await expect(page.locator(".pk-zone")).toHaveCount(4);
    await expect(page.getByTestId("layout-summary")).toHaveCount(0);
});

test("a pie in a low report is drawn inside its box, labels included", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("?data=tickets&height=480");
    await page.getByTestId("layout-summary").click();
    await page.getByTestId("show-chart").click();
    await toolbar(page, "chart-type");
    await page.getByTestId("chart-pie").click();
    const canvas = page.locator('[data-testid="pivot-chart"] canvas');
    await expect(canvas).toBeVisible();
    await page.waitForTimeout(600);
    // the canvas is the box, not taller: nothing of the pie is cut at the bottom
    const [chart, box] = await Promise.all([canvas.boundingBox(), page.locator(".pk-chart-box").boundingBox()]);
    expect(chart.y + chart.height).toBeLessThanOrEqual(box.y + box.height + 0.5);
    // the lowest drawn pixel (pie or label) is above the canvas's bottom edge
    const lowest = await canvas.evaluate((c) => {
        const ctx = c.getContext("2d");
        const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
        const bg = data.slice(0, 4).join();
        for (let y = height - 1; y >= 0; y--) {
            for (let x = 0; x < width; x++) {
                const i = (y * width + x) * 4;
                if (data.slice(i, i + 4).join() !== bg) return { y, height };
            }
        }
        return { y: -1, height };
    });
    expect(lowest.y).toBeGreaterThan(0);
    expect(lowest.y).toBeLessThan(lowest.height - 2);
});

test("chart tooltips show labels from the data as text: category, series and slice names", async ({ page }) => {
    await page.goto("?data=markup");
    await page.getByTestId("show-chart").click();
    const chart = page.getByTestId("pivot-chart");
    const canvas = chart.locator("canvas");
    await expect(canvas).toBeVisible();
    // hovers along a path until the tooltip (ECharts' HTML next to the canvas) shows `text`
    const hoverUntil = async (points, text) => {
        const box = await canvas.boundingBox();
        for (const [fx, fy] of points) {
            await page.mouse.move(box.x + box.width * fx, box.y + box.height * fy);
            await page.waitForTimeout(120);
            if ((await chart.textContent()).includes(text)) return true;
        }
        return false;
    };
    const across = Array.from({ length: 24 }, (_, i) => [0.08 + (0.88 * i) / 23, 0.6]);
    const markupShown = async () => {
        expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
        expect(await chart.locator("img, b, script").count()).toBe(0);
    };
    // bars: the categories are the labels
    expect(await hoverUntil(across, "<img src=x onerror=window.__pwned=1>")).toBe(true);
    await markupShown();
    expect(await hoverUntil(across, "<b>bold")).toBe(true);
    await markupShown();
    // pie: the slices are the labels
    await toolbar(page, "chart-type");
    await page.getByTestId("chart-pie").click();
    const ring = Array.from({ length: 36 }, (_, i) => [0.5 + 0.18 * Math.cos((i * Math.PI) / 18), 0.55 + 0.3 * Math.sin((i * Math.PI) / 18)]);
    expect(await hoverUntil(ring, "<img src=x onerror")).toBe(true);
    await markupShown();
    // rows and columns swapped: the series are the labels
    await toolbar(page, "chart-type");
    await page.getByTestId("chart-bar").click();
    await page.getByTestId("swap").click();
    await expect.poll(() => chips(page, "cols")).toEqual(["Label"]);
    expect(await hoverUntil(across, "<img src=x onerror")).toBe(true);
    await markupShown();
});

test("Enlarge lets the result fill the report; Escape or the button brings the zones back", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("?data=tickets");
    const result = page.locator(".pk-result");
    const before = (await result.boundingBox()).height;
    const enlarge = page.getByTestId("enlarge");
    await expect(enlarge).toHaveAttribute("aria-pressed", "false");
    await enlarge.click();
    await expect(enlarge).toHaveAttribute("aria-pressed", "true");
    // the button says what a click does now
    await expect(enlarge).toHaveText("Reduce");
    await expect(page.locator(".pk-zones")).toBeHidden();
    await expect(page.locator(".pk-panel-slot")).toBeHidden();
    await expect(page.getByTestId("enlarged-fields")).toHaveText("Rows: Team · Columns: Priority · Values: Count of Ticket");
    expect((await result.boundingBox()).height).toBeGreaterThan(before + 100);
    // Escape closes an open menu of the report first; the result stays enlarged
    await toolbar(page, "options");
    await expect(page.locator(".pk-popover")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(page.locator(".pk-popover")).toHaveCount(0);
    await expect(page.locator(".pk-zones")).toBeHidden();
    // an Escape outside the report (a host's dialog, say) is not the report's
    await page.getByTestId("pg-theme").focus();
    await page.keyboard.press("Escape");
    await expect(page.locator(".pk-zones")).toBeHidden();
    // inside the report it ends Enlarge
    await enlarge.focus();
    await page.keyboard.press("Escape");
    await expect(page.locator(".pk-zones")).toBeVisible();
    await enlarge.click();
    await enlarge.click();
    await expect(page.locator(".pk-zones")).toBeVisible();
    // not part of the view: the address keeps no trace of it
    expect(page.url()).not.toContain("enlarge");
});

test("Full screen puts the report on the screen where the browser can", async ({ page, browserName }) => {
    await page.goto("?data=tickets");
    const can = await page.evaluate(() => document.fullscreenEnabled && typeof HTMLElement.prototype.requestFullscreen === "function");
    const button = page.getByTestId("full-screen");
    if (!can) {
        await expect(button).toHaveCount(0);
        return;
    }
    test.skip(browserName === "webkit", "WebKit in the test container grants no full screen (headless)");
    await button.click();
    await expect.poll(() => page.evaluate(() => document.fullscreenElement?.classList.contains("pk-root") ?? false)).toBe(true);
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await button.click();
    await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
    await expect(button).toHaveAttribute("aria-pressed", "false");
});

test("without a height of the host's (or with grow on) a report too low for itself grows, so the page scrolls", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("?data=tickets&height=360&grow=on");
    const root = page.locator(".pk-root");
    await expect(page.getByTestId("layout-summary")).toBeVisible();
    await expect.poll(async () => (await root.boundingBox()).height).toBeGreaterThan(360);
    const result = await page.locator(".pk-result").boundingBox();
    expect(result.height).toBeGreaterThanOrEqual(239);
    const report = await root.boundingBox();
    const status = await page.locator(".pk-status").boundingBox();
    expect(status.y + status.height).toBeLessThanOrEqual(report.y + report.height + 1);
});

test("a fixed 420 px card keeps the report inside: nothing is cut, the result scrolls", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("?data=tickets&height=420");
    const root = page.locator(".pk-root");
    await expect(page.getByTestId("layout-summary")).toBeVisible();
    await expect(root).toHaveAttribute("data-pk-fit", "contain");
    await page.waitForTimeout(300);
    const report = await root.boundingBox();
    expect(Math.round(report.height)).toBe(420);
    // the status line and the result lie inside the card; the table scrolls inside the result
    for (const part of [".pk-status", ".pk-result", ".pk-toolbar"]) {
        const box = await page.locator(part).boundingBox();
        expect(box.y + box.height, part).toBeLessThanOrEqual(report.y + report.height + 1);
    }
    const table = page.getByTestId("pivot-table");
    expect(await table.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
});

test("a narrow report folds its zones earlier and keeps one tip", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 });
    await page.goto("?data=tickets&height=700");
    await expect(page.getByTestId("layout-summary")).toBeVisible();
    expect(await page.locator(".pk-tip").count()).toBeLessThanOrEqual(1);
});

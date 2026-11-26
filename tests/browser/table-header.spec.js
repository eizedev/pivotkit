// The table's header (#920): each field's name carries its zone's icon and fill (a value name repeated
// over the columns its icon alone), in the same fill as its chip and its mark in the field list; the
// values stay the lowest column level; the header cells keep their scope, the empty corner names the
// fields on each axis; the sort arrow stands behind the name, at rest only on the sorted header, in the
// glyph of the sorted chip. The zones' colours keep 4.6:1 on the header and 3:1 on their fills, a
// chip's controls 3:1 on its fill: measured as the browser draws them, light and dark, wide and narrow,
// in English and German.
import { encodeViewLink } from "pivotkit-core/link";
import { expect, test } from "./fixtures.js";
import { installContrast } from "./contrast.js";

const count = { field: "Ticket", agg: "count" };
const lead = { field: "Lead hours", agg: "average", format: "duration:h" };
const sort = [{ field: "Team", by: "value", order: "desc" }];
const LAYOUTS = [
    { name: "one field on each axis, one value", view: { rows: ["Team"], cols: ["Priority"], values: [count], sort } },
    { name: "two fields on each axis, one value", view: { rows: ["Team", "Category"], cols: ["Priority", "Channel"], values: [count], sort } },
    { name: "one field on each axis, two values", view: { rows: ["Team"], cols: ["Priority"], values: [count, lead], sort } },
    { name: "two fields on each axis, two values", view: { rows: ["Team", "Category"], cols: ["Priority", "Channel"], values: [count, lead], sort } }
];
const VALUE_NAMES = { en: ["Count of Ticket", "Average of Lead hours"], de: ["Anzahl von Ticket", "Durchschnitt von Lead hours"] };
const CORNER = {
    en: "Rows: Team, Category; Columns: Priority, Channel",
    de: "Zeilen: Team, Category; Spalten: Priority, Channel"
};

/** The playground with a view, in a theme and a language. */
async function open(page, view, { theme = "light", lang = "en", data = "tickets" } = {}) {
    await page.goto(`?data=${data}&empty&lang=${lang}&theme=${theme}#pivot-playground=${encodeViewLink(view)}`);
    await expect(page.locator('[data-testid="pivot-table"] thead th').first()).toBeVisible();
}

/** Each field's name in the header, row by row: its text, zone, fill, scope and whether it has its zone's icon. */
const fieldNames = (page) =>
    page.getByTestId("pivot-table").locator("thead tr").evaluateAll((rows) =>
        rows.flatMap((tr, r) =>
            [...tr.querySelectorAll(".pk-th-field")].map((el) => {
                const zone = [...el.classList].find((c) => c.startsWith("pk-th-zone-"))?.slice("pk-th-zone-".length);
                const fill = el.classList.contains("pk-zone-fill") ? " filled" : "";
                const icon = el.querySelector(":scope > .pk-th-zone") ? "" : " NO ICON";
                return `${r}: ${el.querySelector(".pk-th-text").textContent} ${zone}${fill} ${el.closest("th").getAttribute("scope")}${icon}`;
            })
        )
    );

/** What the header should show for a layout: row field names in the last row, column field names one row each. */
function expected(view, lang, headerRows) {
    const last = headerRows - 1;
    const names = VALUE_NAMES[lang];
    const cols = view.cols.map((f, r) => `${r}: ${f} cols filled row`);
    const rows = view.rows.map((f) => `${last}: ${f} rows filled col`);
    return { cols, rows, values: view.values.map((_, i) => `${last}: ${names[i]} values${view.values.length < 2 ? " filled" : ""} col`) };
}

/**
 * The least contrast of what the header and the chips draw in the zones' colours, as the browser
 * resolves them: a zone's icon on the header's background and on its fill, a field's name on its
 * fill, a chip's controls (grip, menu arrow, x) on the chip's fill.
 */
const contrasts = (page) =>
    page.evaluate(() => {
        const { parse, ratio, behind } = /** @type {any} */ (window).__pkContrast;
        const least = (pairs) => Math.min(...pairs.map(([fg, bg]) => ratio(parse(getComputedStyle(fg).color), behind(bg))));
        const header = [...document.querySelectorAll(".pk-table thead .pk-th-field")];
        const filled = header.filter((el) => el.classList.contains("pk-zone-fill"));
        const chips = [...document.querySelectorAll(".pk-chip.pk-zone-fill")];
        const controls = chips.flatMap((chip) => [...chip.querySelectorAll(".pk-handle, .pk-caret, .pk-chip-x")].map((c) => [c, chip]));
        const onGrand = (el) => el.closest("th").classList.contains("pk-grand");
        return {
            iconOnHeader: least(header.filter((el) => !onGrand(el)).map((el) => [el.querySelector(".pk-th-zone"), el.closest("th")])),
            iconOnGrand: header.some(onGrand) ? least(header.filter(onGrand).map((el) => [el.querySelector(".pk-th-zone"), el.closest("th")])) : Infinity,
            iconOnFill: least(filled.map((el) => [el.querySelector(".pk-th-zone"), el])),
            nameOnFill: least(filled.map((el) => [el.querySelector(".pk-th-text"), el])),
            controlsOnFill: controls.length ? least(controls) : Infinity
        };
    });

test.describe("the table's header names its fields by zone (#920)", () => {
    for (const layout of LAYOUTS) {
        test(`${layout.name}: icons, fills, scopes and contrast, light and dark, 1280 and 390 px, English and German`, async ({ page }) => {
            const least = { iconOnHeader: Infinity, iconOnGrand: Infinity, iconOnFill: Infinity, nameOnFill: Infinity, controlsOnFill: Infinity };
            for (const theme of ["light", "dark"]) {
                for (const width of [1280, 390]) {
                    for (const lang of ["en", "de"]) {
                        const where = `${theme}, ${width} px, ${lang}`;
                        await page.setViewportSize({ width, height: 900 });
                        await open(page, layout.view, { theme, lang });
                        const table = page.getByTestId("pivot-table");
                        const headerRows = await table.locator("thead tr").count();
                        const names = await fieldNames(page);
                        const want = expected(layout.view, lang, headerRows);
                        expect(names.filter((n) => n.includes(" cols ")), where).toEqual(want.cols);
                        expect(names.filter((n) => n.includes(" rows ")), where).toEqual(want.rows);
                        // the values stay the lowest column level: each value's name, once per column with two values
                        const values = names.filter((n) => n.includes(" values "));
                        expect([...new Set(values)], where).toEqual(want.values);
                        // the empty corner names the fields on each axis; a corner with a field's name is that header
                        const blank = table.locator("thead td.pk-blank");
                        if (layout.view.rows.length > 1) {
                            await expect(blank.locator(".pk-sr"), where).toHaveText(CORNER[lang]);
                        }
                        // the field's name is text in the text's colour, never in the zone's
                        const colours = await table.locator("thead .pk-th-field .pk-th-text").evaluateAll((els) => [...new Set(els.map((e) => getComputedStyle(e).color))]);
                        const text = await page.locator(".pk-root").evaluate((el) => getComputedStyle(el).color);
                        expect(colours, where).toEqual([text]);
                        await installContrast(page);
                        const measured = await contrasts(page);
                        for (const key of Object.keys(least)) {
                            least[key] = Math.min(least[key], measured[key]);
                        }
                    }
                }
            }
            // on the header, and on the Grand Total column's darker header as well
            expect(least.iconOnHeader).toBeGreaterThanOrEqual(4.6);
            expect(least.iconOnGrand).toBeGreaterThanOrEqual(4.6);
            expect(least.iconOnFill).toBeGreaterThanOrEqual(3);
            expect(least.nameOnFill).toBeGreaterThanOrEqual(4.5);
            expect(least.controlsOnFill).toBeGreaterThanOrEqual(3);
            test.info().annotations.push({ type: "contrast", description: JSON.stringify(Object.fromEntries(Object.entries(least).map(([k, v]) => [k, Number(v.toFixed(2))]))) });
        });
    }

    test("a screen reader hears the header cells as headers: field names without their icon, a data cell under its row and column items", async ({ page }) => {
        await open(page, LAYOUTS[1].view);
        const table = page.getByTestId("pivot-table");
        // a column field's name heads its row of items, a row field's name its column of labels
        await expect(table.getByRole("rowheader", { name: "Priority", exact: true })).toHaveAttribute("scope", "row");
        await expect(table.getByRole("rowheader", { name: "Channel", exact: true })).toHaveAttribute("scope", "row");
        await expect(table.getByRole("columnheader", { name: "Team", exact: true })).toHaveAttribute("scope", "col");
        await expect(table.getByRole("columnheader", { name: "Category", exact: true })).toHaveAttribute("scope", "col");
        await expect(table.getByRole("columnheader", { name: "Count of Ticket", exact: true })).toHaveAttribute("scope", "col");
        await expect(table.getByRole("columnheader", { name: "Chat", exact: true }).first()).toHaveAttribute("scope", "col");
        // the empty corner is no header: it names the axes in words of its own
        await expect(table.locator("thead td.pk-blank")).toHaveCount(1);
        await expect(table.locator("thead th").filter({ hasText: /^$/ })).toHaveCount(0);
        // the first value cell of the first row: the headers over its column and beside its row, as a
        // screen reader takes them from the table (th with scope col above it, th of its row)
        const heard = await table.locator('tbody tr[data-r="0"] td').first().evaluate((td) => {
            const box = td.getBoundingClientRect();
            const middle = box.left + box.width / 2;
            const tbl = td.closest("table");
            const columns = [...tbl.querySelectorAll('thead th[scope="col"]')].filter((th) => {
                const b = th.getBoundingClientRect();
                return b.left <= middle && middle <= b.right;
            });
            const rows = [...td.closest("tr").querySelectorAll('th[scope="row"]')];
            return { columns: columns.map((th) => th.textContent.trim()), rows: rows.map((th) => th.textContent.trim()) };
        });
        expect(heard.rows).toEqual(["Service Desk", "Access"]);
        expect(heard.columns).toContain("Count of Ticket");
        expect(heard.columns).toEqual(expect.arrayContaining(["P1 Critical", "Chat", "Count of Ticket"]));
    });

    test("the sort arrow: behind the name, on the sorted header at rest, in the sorted chip's glyph; others on hover and focus", async ({ page }) => {
        await open(page, LAYOUTS[0].view);
        const table = page.getByTestId("pivot-table");
        const sorted = table.locator("thead .pk-th-sort.pk-sorted");
        await expect(sorted).toHaveCount(1);
        await expect(sorted).toHaveText("Count of Ticket");
        // the order in words is the button's description, not its name: the name heads every cell below
        await expect(sorted).toHaveAccessibleName("Count of Ticket");
        // and, as the tooltip says, what the next click does
        await expect(sorted).toHaveAccessibleDescription("sorted Largest Count of Ticket first. Sort by Count of Ticket: smallest first");
        await expect(sorted).toHaveAttribute("title", "Sort by Count of Ticket: smallest first");
        const arrow = sorted.locator(".pk-th-arrow");
        await expect(arrow).toHaveCSS("opacity", "1");
        // behind the name
        const [name, mark] = await Promise.all([sorted.locator(".pk-th-text").boundingBox(), arrow.boundingBox()]);
        expect(mark.x).toBeGreaterThanOrEqual(name.x + name.width - 1);
        // one glyph for one order: the chip of Team, sorted by the value, draws the same arrow in the same colour
        const glyph = page.locator('[data-zone="rows"] .pk-chip .pk-sort-glyph');
        expect(await glyph.locator("path").getAttribute("d")).toBe(await arrow.locator("path").getAttribute("d"));
        const look = (loc) => loc.evaluate((el) => [getComputedStyle(el).color, getComputedStyle(el).strokeWidth]);
        expect(await look(glyph)).toEqual(await look(arrow));
        // any other header: no arrow at rest, the order a click gives on hover and on focus
        const item = table.getByRole("columnheader", { name: "P1 Critical", exact: true }).locator(".pk-th-sort");
        const itemArrow = item.locator(".pk-th-arrow");
        await expect(itemArrow).toHaveCSS("opacity", "0");
        await item.hover();
        await expect(itemArrow).toHaveCSS("opacity", "1");
        await page.mouse.move(0, 0);
        await expect(itemArrow).toHaveCSS("opacity", "0");
        await item.focus();
        await expect(itemArrow).toHaveCSS("opacity", "1");
    });

    test("a zone's fill is one colour in the field area, the field list and the table; a filter's chip and the type icons stay neutral", async ({ page }) => {
        const view = { ...LAYOUTS[0].view, values: [count, lead], filters: [{ field: "Status", type: "in", items: ["Open"], blanks: "exclude" }] };
        for (const theme of ["light", "dark"]) {
            await open(page, { ...view, values: [count] }, { theme });
            const bg = (selector) => page.locator(selector).first().evaluate((el) => getComputedStyle(el).backgroundColor);
            for (const [zone, chip] of [["rows", "rows"], ["cols", "cols"], ["values", "values"]]) {
                const fill = await bg(`.pk-chip-${chip}`);
                expect(await bg(`.pk-badge-${zone}`), `${theme} ${zone}`).toBe(fill);
                expect(await bg(`.pk-table thead .pk-th-zone-${zone}.pk-zone-fill`), `${theme} ${zone}`).toBe(fill);
                expect(fill, `${theme} ${zone}`).not.toBe(await bg(".pk-root"));
            }
            await open(page, view, { theme });
            expect(await bg(".pk-chip-filters"), theme).toBe(await bg(".pk-root"));
            // the type icons are neutral: the muted colour of the hints
            const muted = await page.locator(".pk-root").first().evaluate((root) => {
                const probe = root.appendChild(document.createElement("span"));
                probe.style.color = "var(--pk-muted)";
                const color = getComputedStyle(probe).color;
                probe.remove();
                return color;
            });
            const types = await page.locator(".pk-field .pk-type, .pk-chip .pk-type").evaluateAll((els) => [...new Set(els.map((e) => getComputedStyle(e).color))]);
            expect(types, theme).toEqual([muted]);
        }
    });

    test("a host's zone colours, fill share and type colours take effect", async ({ page }) => {
        await open(page, LAYOUTS[0].view);
        await page.addStyleTag({ content: ".pk-root { --pk-zone-rows: #6b2fa0; --pk-zone-tint: 50%; --pk-zone-tint-base: #ffffff; --pk-type-string: #b00020; }" });
        await expect(page.locator(".pk-table thead .pk-th-zone-rows .pk-th-zone")).toHaveCSS("color", "rgb(107, 47, 160)");
        // half of #6b2fa0 in white
        const fill = await page.locator(".pk-chip-rows").evaluate((el) => getComputedStyle(el).backgroundColor);
        expect(fill).toMatch(/^(rgb\(181, 151, 208\)|color\(srgb 0\.7\d* 0\.59\d* 0\.81\d*\))$/);
        await expect(page.locator('.pk-field[data-field="Team"] .pk-type')).toHaveCSS("color", "rgb(176, 0, 32)");
    });

    test("forced colours: a field's fill becomes a frame", async ({ page, browserName }) => {
        test.skip(browserName !== "chromium", "Playwright emulates forced colours in Chromium only");
        await page.emulateMedia({ forcedColors: "active" });
        await open(page, LAYOUTS[0].view);
        await expect(page.locator(".pk-table thead .pk-th-field.pk-zone-fill").first()).toHaveCSS("border-top-style", "solid");
        await expect(page.locator(".pk-badge.pk-zone-fill").first()).toHaveCSS("border-top-style", "solid");
    });

    test("reflow: at 640 px (1280 px at 200 %) the zones stand in one column and the page does not scroll sideways; at 390 px neither", async ({ page }) => {
        for (const width of [640, 390]) {
            await page.setViewportSize({ width, height: 900 });
            await open(page, LAYOUTS[3].view);
            expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${width} px`).toBeLessThanOrEqual(0);
        }
        await page.setViewportSize({ width: 640, height: 900 });
        await open(page, LAYOUTS[3].view);
        const zones = page.locator(".pk-zone");
        if (await zones.first().isHidden()) {
            await page.getByTestId("zone-section").locator(".pk-section-fold").click();
        }
        await expect(zones.first()).toBeVisible();
        const lefts = await zones.evaluateAll((els) => [...new Set(els.map((e) => Math.round(e.getBoundingClientRect().left)))]);
        expect(lefts).toHaveLength(1);
    });
});

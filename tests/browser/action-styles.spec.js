// The menus' text actions and icon buttons draw as their classes say, against the reset of the
// report's form controls (`font: inherit; color: inherit` for button, input, select, textarea): the
// text actions (.pk-action, .pk-link) in the accent, at the small size and weight 600, muted while
// disabled; the icon buttons (.pk-icon-btn, .pk-chip-x, .pk-info) muted until hovered; inputs and
// selects in the report's font. Each colour is read as the person sees it (computed, against the
// token resolved in the same report) and checked for contrast in both themes. The text actions drew
// as plain text in the text colour while the reset outranked their classes (issue #193).
import { encodeViewLink } from "pivotkit-core/link";
import { chipMenu, expect, openRules, test } from "./fixtures.js";

/** The weather by month, the last two years as a quick choice: Reset filter and "change it above". */
const DATES = {
    derived: [{ name: "Date by month", field: "Date", by: "yearMonth" }],
    rows: ["Date by month"],
    values: [{ field: "Mean °C", agg: "average" }],
    filters: [{ field: "Date by month", type: "relative", unit: "year", count: 2 }]
};
/** Regions with more than 2 million revenue: a rule to remove, items to pick. */
const VALUE_RULE = {
    rows: ["Region", "Product"],
    values: [{ field: "Units", agg: "sum" }, { field: "Revenue", agg: "sum" }],
    filters: [{ field: "Region", type: "value", op: ">", value: 2_000_000, by: { field: "Revenue", agg: "sum" } }]
};

async function openView(page, data, view, theme = "light") {
    await page.goto(`?data=${data}&empty&theme=${theme}#pivot-playground=${encodeViewLink(view)}`);
    await expect(page.locator('[data-testid="pivot-table"]')).toBeVisible();
}

/**
 * How an element draws: its colour, size and weight, the report's tokens resolved in the same report,
 * and the contrast of its colour against what is behind it (the backgrounds of its ancestors, laid
 * over each other up to the first opaque one).
 */
function look(locator) {
    return locator.evaluate((el) => {
        // any CSS colour (rgb(), color(srgb), oklab() of a color-mix) as 0-255 RGB and an alpha, through a canvas
        const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
        const parse = (c) => {
            ctx.clearRect(0, 0, 1, 1);
            ctx.fillStyle = c;
            ctx.fillRect(0, 0, 1, 1);
            const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
            return a === 0 ? [0, 0, 0, 0] : [r, g, b, a / 255];
        };
        const over = (top, below) => [0, 1, 2].map((i) => top[i] * top[3] + below[i] * (1 - top[3])).concat(1);
        const lum = (c) => {
            const [r, g, b] = c.slice(0, 3).map((v) => {
                const s = v / 255;
                return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
            });
            return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        const layers = [];
        for (let n = el; n; n = n.parentElement) {
            const bg = parse(getComputedStyle(n).backgroundColor);
            if (bg[3] > 0) layers.push(bg);
            if (bg[3] === 1) break;
        }
        let behind = [255, 255, 255, 1];
        for (const layer of layers.reverse()) behind = over(layer, behind);
        const style = getComputedStyle(el);
        // an opacity on the element or its ancestors fades the text into what is behind it
        let opacity = 1;
        for (let n = el; n; n = n.parentElement) opacity *= Number(getComputedStyle(n).opacity);
        const ink = parse(style.color);
        const ratio = (alpha) => {
            const [hi, lo] = [lum(over([ink[0], ink[1], ink[2], alpha], behind)), lum(behind)].sort((a, b) => b - a);
            return (hi + 0.05) / (lo + 0.05);
        };
        const root = el.closest(".pk-root") ?? document.querySelector(".pk-root");
        const token = (name, prop) => {
            const probe = document.createElement("span");
            probe.style.setProperty(prop, `var(${name})`);
            root.append(probe);
            const value = getComputedStyle(probe).getPropertyValue(prop);
            probe.remove();
            return value;
        };
        return {
            color: style.color,
            fontSize: style.fontSize,
            fontWeight: style.fontWeight,
            textDecoration: style.textDecorationLine,
            accent: token("--pk-accent", "color"),
            muted: token("--pk-muted", "color"),
            text: token("--pk-text", "color"),
            danger: token("--pk-danger", "color"),
            small: token("--pk-small", "font-size"),
            contrast: ratio(ink[3] * opacity),
            // the colour itself, without the opacity that fades it (a disabled action's)
            solidContrast: ratio(ink[3])
        };
    });
}

/**
 * A text action: the accent, weight 600, at least 4.5:1 against its background; at the small size
 * (`small`, .pk-action and the links among the menu's small texts) or at the size around it (Back).
 */
async function expectTextAction(locator, what, { small = true } = {}) {
    const l = await look(locator);
    expect(l.color, `${what}: colour`).toBe(l.accent);
    expect(l.fontSize, `${what}: size`).toBe(small ? l.small : await locator.evaluate((el) => getComputedStyle(el.parentElement).fontSize));
    expect(l.fontWeight, `${what}: weight`).toBe("600");
    expect(l.contrast, `${what}: contrast`).toBeGreaterThanOrEqual(4.5);
}

/**
 * A disabled text action: muted, and still readable (4.5:1 before its opacity, 3:1 after). WCAG
 * exempts a disabled control from contrast; the 3:1 keeps it legible as a greyed-out action.
 */
async function expectDisabledAction(locator, what) {
    await expect(locator).toBeDisabled();
    const l = await look(locator);
    expect(l.color, `${what}: colour`).toBe(l.muted);
    expect(l.fontWeight, `${what}: weight`).toBe("600");
    expect(l.solidContrast, `${what}: contrast before its opacity`).toBeGreaterThanOrEqual(4.5);
    expect(l.contrast, `${what}: contrast after its opacity`).toBeGreaterThanOrEqual(3);
}

/** An icon button: muted until hovered, at least 3:1 (a UI component) against its background. */
async function expectIconButton(locator, what) {
    const l = await look(locator);
    expect(l.color, `${what}: colour`).toBe(l.muted);
    expect(l.contrast, `${what}: contrast`).toBeGreaterThanOrEqual(3);
}

/** The pointer away from the report, so no hover style is read by mistake. */
const away = (page) => page.mouse.move(1, 1);

// the colours as they end: no transition caught halfway (the report's transitions go with reduced motion)
test.use({ reducedMotion: "reduce" });

for (const theme of ["light", "dark"]) {
    test.describe(`the menus' text actions in the ${theme} theme`, () => {
        test("Reset filter, change it above and Back are accent text actions; Reset filter is muted while there is nothing to reset", async ({ page }) => {
            await openView(page, "weather", DATES, theme);
            await chipMenu(page, "Date by month", "filter");
            const menu = page.locator(".pk-chip-menu");
            await openRules(menu);
            await away(page);
            await expectTextAction(menu.getByTestId("filter-reset"), "Reset filter");
            await expectTextAction(menu.getByTestId("rule-quick-change"), "change it above");
            await expectTextAction(menu.getByTestId("level-back"), "Back", { small: false });
            // the filter reset by its own action: nothing left to reset, the action is muted
            await menu.getByTestId("filter-reset").click();
            await away(page);
            await expectDisabledAction(menu.getByTestId("filter-reset"), "Reset filter, disabled");
            // Back still draws as a link with its underline on hover
            await menu.getByTestId("level-back").hover();
            expect((await look(menu.getByTestId("level-back"))).textDecoration).toBe("underline");
        });

        test("Clear, Remove, Select all, Select none and Only are accent text actions", async ({ page }) => {
            await openView(page, "sales", VALUE_RULE, theme);
            await chipMenu(page, "Region", "filter");
            const menu = page.locator(".pk-chip-menu");
            await openRules(menu);
            await expectTextAction(menu.getByTestId("filter-remove-rules"), "Remove");
            // a region left out by its checkbox: Clear has picks to clear
            const picks = menu.getByTestId("section-picks");
            if ((await picks.getAttribute("aria-expanded")) !== "true") await picks.click();
            await menu.locator(".pk-value input[type=checkbox]").first().click();
            await away(page);
            await expectTextAction(menu.getByTestId("filter-clear-picks"), "Clear");
            await expectTextAction(menu.getByTestId("select-all"), "Select all");
            await expectTextAction(menu.getByTestId("select-none"), "Select none");
            // Only shows on the item under the pointer
            const value = menu.locator(".pk-value").nth(1);
            await value.hover();
            await expect(value.locator(".pk-only")).toBeVisible();
            await expectTextAction(value.locator(".pk-only"), "Only");
        });

        test("Swap rows and columns is an accent text action; the field and chip icon buttons are muted until hovered", async ({ page }) => {
            await page.goto(`?data=sales&theme=${theme}`);
            await expect(page.locator('[data-testid="pivot-table"]')).toBeVisible();
            await away(page);
            await expectTextAction(page.getByTestId("swap"), "Swap rows and columns");
            await expectIconButton(page.getByTestId("field-menu-Region"), "a field's menu button");
            await expectIconButton(page.getByTestId("zone-info-rows"), "a zone's i");
            const x = page.locator('[data-zone="rows"] .pk-chip .pk-chip-x').first();
            await expectIconButton(x, "a chip's remove button");
            // hovered, the remove button turns to the danger colour
            await x.hover();
            await expect.poll(async () => {
                const l = await look(x);
                return l.color === l.danger;
            }).toBe(true);
        });

        test("the skip link, a chip's name, the Fields rail, More choices and a row's expand arrow draw as their classes say", async ({ page }) => {
            await openView(page, "sales", VALUE_RULE, theme);
            await away(page);
            // the skip link past the field list: accent and semibold once the keyboard reaches it
            const skip = page.getByTestId("skip-to-toolbar");
            await skip.focus();
            await expect(skip).toBeFocused();
            const s = await look(skip);
            expect(s.color, "skip link: colour").toBe(s.accent);
            expect(s.fontWeight, "skip link: weight").toBe("600");
            expect(s.contrast, "skip link: contrast").toBeGreaterThanOrEqual(4.5);
            // a chip's name is semibold
            const label = page.locator('[data-zone="rows"] .pk-chip .pk-chip-label').first();
            expect((await look(label)).fontWeight, "a chip's name: weight").toBe("550");
            // a row's expand arrow is a muted icon button
            await expectIconButton(page.locator(".pk-toggle").first(), "a row's expand arrow");
            // the field list folded to its rail: "Fields" in the text colour, weight 650
            await page.getByTestId("collapse-fields").click();
            const rail = page.getByTestId("expand-fields");
            await away(page);
            const r = await look(rail);
            expect(r.color, "the Fields rail: colour").toBe(r.text);
            expect(r.fontWeight, "the Fields rail: weight").toBe("650");
            // More choices of a date's quick choices: a muted disclosure at the small size, readable as text
            await openView(page, "weather", DATES, theme);
            await chipMenu(page, "Date by month", "filter");
            const more = page.locator(".pk-chip-menu").getByTestId("quick-more");
            await away(page);
            const m = await look(more);
            expect(m.color, "More choices: colour").toBe(m.muted);
            expect(m.fontSize, "More choices: size").toBe(m.small);
            expect(m.contrast, "More choices: contrast").toBeGreaterThanOrEqual(4.5);
        });

        test("Undo in a toast stays readable on the toast", async ({ page }) => {
            await page.goto(`?data=sales&theme=${theme}`);
            await expect(page.locator('[data-testid="pivot-table"]')).toBeVisible();
            await page.locator('[data-zone="rows"] .pk-chip .pk-chip-x').first().click();
            const undo = page.locator(".pk-toast-action");
            await expect(undo).toHaveText("Undo");
            await away(page);
            const l = await look(undo);
            expect(l.fontWeight).toBe("600");
            expect(l.contrast, "Undo: contrast").toBeGreaterThanOrEqual(4.5);
        });
    });
}

// the reset is what gives a form control the report's font and colour: a browser draws them in its
// own (13.33 px, system font, black text even in the dark theme); a class may still set a weight
test("inputs and selects keep the report's font family, size and text colour in the dark theme", async ({ page }) => {
    await openView(page, "sales", VALUE_RULE, "dark");
    await chipMenu(page, "Region", "filter");
    const menu = page.locator(".pk-chip-menu");
    await openRules(menu);
    const controls = menu.locator("input:not([type=checkbox]):not([type=radio]), select");
    expect(await controls.count(), "the Filter level has text fields and selects").toBeGreaterThan(1);
    const mismatches = await controls.evaluateAll((els) => els.flatMap((el) => {
        const own = getComputedStyle(el);
        const parent = getComputedStyle(el.parentElement);
        return ["font-family", "font-size", "font-style", "color"]
            .filter((p) => own.getPropertyValue(p) !== parent.getPropertyValue(p))
            .map((p) => `${el.tagName.toLowerCase()}[${el.getAttribute("data-testid") ?? el.name}] ${p}: ${own.getPropertyValue(p)} vs ${parent.getPropertyValue(p)}`);
    }));
    expect(mismatches).toEqual([]);
});

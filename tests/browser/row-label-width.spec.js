// Row labels and field names take the room the report has (#584). When the table fits, a row label,
// a field name in the corner and a value's name keep their natural width, on one line. Only a table
// wider than the report caps them, and then they share the room the value columns leave. A word
// breaks only when it alone is wider than that cap. A virtual table (300 body rows and more) cuts a
// label instead of wrapping it, so there the check is that nothing is cut while the table fits.
//
// The data is a CSV with camelCase column names, as a service's export has them, dropped onto the
// playground. The fields go into the zones through their menus, as a person does it. The report's
// font is Arial, or Liberation Sans, which has Arial's widths (Linux CI): the widths the cases are
// sized for are the same on every machine.
import { chips, expect, pinFont, test } from "./fixtures.js";
import { dropFiles } from "./import-helpers.js";

const SERVICES = ["paymentGateway", "customerPortal", "inventorySync", "notificationHub", "identityProvider", "searchIndex"];
/** Longer service names: with them the five label columns are wider than the report at 1440 px. */
/** Service names of several words: a table of them can wrap far before it reaches the caps. */
const SPACED_SERVICES = ["payment gateway orchestration", "customer portal frontend", "inventory synchronisation job", "notification dispatcher queue", "identity provider federation", "reporting warehouse loader"];
const LONG_SERVICES = ["paymentGatewayOrchestration", "customerPortalFrontend", "inventorySynchronisation", "notificationDispatcher", "identityProviderFederation", "reportingWarehouse"];
const REGIONS = ["westEurope", "northEurope", "eastUnitedStates", "southeastAsia"];
const ENVIRONMENTS = ["production", "staging", "development"];
const TIERS = ["standard", "premium", "enterprise"];

/**
 * A CSV of `n` rows with camelCase column names, made from fixed lists (no randomness): serviceName,
 * productNumber, deploymentRegion, environmentType, supportTier, costCenter and the
 * numbers monthlyCost and cost. `products` distinct product numbers make the body as long as the test needs.
 */
function servicesCsv(n, products, costCenters = 4, services = SERVICES) {
    const lines = ["serviceName,productNumber,deploymentRegion,environmentType,supportTier,costCenter,monthlyCost,cost"];
    for (let i = 0; i < n; i++) {
        const cost = ((i * 7919) % 5000) / 10 + 12.5;
        lines.push([services[i % services.length], `PRD-${10000 + (i % products)}`, REGIONS[i % REGIONS.length], ENVIRONMENTS[i % ENVIRONMENTS.length], TIERS[i % TIERS.length], `CC-${4100 + (i % costCenters)}`, cost.toFixed(2), (cost / 2).toFixed(2)].join(","));
    }
    return `${lines.join("\n")}\n`;
}

const ROWS = ["serviceName", "productNumber", "deploymentRegion", "environmentType", "supportTier"];

/** Loads the CSV into the playground and puts the fields into Rows, Columns and Values by their menus. */
async function report(page, csv, { rows = ROWS, cols = [], values = ["monthlyCost"] } = {}) {
    await page.goto("?data=sales&import");
    await pinFont(page);
    await expect(page.getByTestId("pivot-table")).toBeVisible();
    await dropFiles(page, page.getByTestId("pivot-table"), [{ name: "services.csv", type: "text/csv", text: csv }]);
    await page.getByTestId("import-apply").click();
    await expect(page.getByTestId("import-dialog")).toHaveCount(0);
    for (const [zone, fields] of [["Rows", rows], ["Columns", cols], ["Values", values]]) {
        for (const field of fields) {
            await page.getByTestId(`field-menu-${field}`).click();
            await page.getByRole("menuitem", { name: `Add to ${zone}`, exact: true }).click();
        }
    }
    await expect.poll(() => chips(page, "rows")).toHaveLength(rows.length);
    await settled(page);
}

/** Two frames: the table has measured itself after the last change. */
const settled = (page) => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));

/**
 * The layout of the labels: each row label, field name in the corner and value name with its text,
 * its lines, whether it is cut ("…"), and the words broken inside although they alone fit the label's
 * width. Measured with ranges over the text, as the browser laid it out.
 */
function labelLayout(page) {
    return page.evaluate(() => {
        const sel = ".pk-table :is(tbody th.pk-rowHeader, thead th.pk-corner, thead tr:last-child th.pk-colHeader) .pk-th-text";
        const tops = (rects) => new Set([...rects].filter((r) => r.width > 0).map((r) => Math.round(r.top))).size;
        return [...document.querySelectorAll(sel)].map((el) => {
            const range = document.createRange();
            range.selectNodeContents(el);
            const broken = [];
            for (const node of [...el.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE)) {
                for (const m of node.textContent.matchAll(/\S+/g)) {
                    const word = document.createRange();
                    word.setStart(node, m.index);
                    word.setEnd(node, m.index + m[0].length);
                    const rects = [...word.getClientRects()].filter((r) => r.width > 0);
                    const wide = rects.reduce((s, r) => s + r.width, 0);
                    // fractional widths: clientWidth rounds, and a word 0.4 px too wide would count as fitting
                    if (tops(rects) > 1 && wide <= el.getBoundingClientRect().width) broken.push(m[0]);
                }
            }
            // a header's name that sorts is inline text in its button (its arrow follows the last
            // word): an inline box has no client width, so the button is what would cut it
            const box = getComputedStyle(el).display === "inline" ? el.parentElement : el;
            return { text: el.textContent, lines: tops(range.getClientRects()), cut: box.scrollWidth > box.clientWidth + 1, broken };
        });
    });
}

/** The table's and its box's widths, and how many values with text show whole inside the box. */
function tableBox(page) {
    return page.evaluate(() => {
        const wrap = document.querySelector(".pk-table-wrap").getBoundingClientRect();
        const table = document.querySelector(".pk-table").getBoundingClientRect();
        const values = [...document.querySelectorAll(".pk-table tbody td")].filter((td) => {
            const r = td.getBoundingClientRect();
            return td.textContent.trim() !== "" && r.left >= wrap.left - 0.5 && r.right <= wrap.right + 0.5 && r.bottom <= wrap.bottom;
        }).length;
        return { wrap: wrap.width, table: table.width, values };
    });
}

test.describe("at 1440 x 900", () => {
    test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
    });

    test("five row fields with long camelCase names and one value: labels and field names on one line, no word broken", async ({ page }) => {
        await report(page, servicesCsv(48, 24), { values: ["cost"] });
        const box = await tableBox(page);
        // the table fits, with room to spare (the report of #584 filled about 60 %): other fonts
        // than this machine's must not tip it over. The sort marks' end padding (#920) takes about
        // 0.3 % of it
        expect(box.table).toBeLessThan(box.wrap * 0.92);
        const labels = await labelLayout(page);
        expect(labels.map((l) => l.text)).toEqual(expect.arrayContaining([...ROWS, "Sum of cost", "paymentGateway Total"]));
        expect(labels.filter((l) => l.broken.length > 0).map((l) => `${l.text}: ${l.broken}`)).toEqual([]);
        expect(labels.filter((l) => l.lines > 1).map((l) => l.text)).toEqual([]);
        expect(labels.filter((l) => l.cut).map((l) => l.text)).toEqual([]);
    });

    test("the same in a virtual table (300 body rows and more): no label cut while the table fits", async ({ page }) => {
        await report(page, servicesCsv(720, 360), { values: ["cost"] });
        await expect(page.locator(".pk-table.pk-virtual")).toHaveCount(1);
        const box = await tableBox(page);
        expect(box.table).toBeLessThan(box.wrap);
        const labels = await labelLayout(page);
        expect(labels.filter((l) => l.cut).map((l) => l.text)).toEqual([]);
        expect(labels.filter((l) => l.lines > 1).map((l) => l.text)).toEqual([]);
    });

    test("labels a little too wide for the report: they share the room the value column leaves", async ({ page }) => {
        await report(page, servicesCsv(48, 24, 4, SPACED_SERVICES), { values: ["cost"] });
        // a window 60 px narrower than the natural table needs: sized from what this browser measures
        const natural = await tableBox(page);
        await page.setViewportSize({ width: Math.floor(1440 - (natural.wrap - natural.table)) - 60, height: 900 });
        await settled(page);
        const box = await tableBox(page);
        // the table takes the report's width, no less (the cap is not a fixed 40 %) and no more
        expect(box.table).toBeLessThanOrEqual(box.wrap);
        expect(box.table).toBeGreaterThan(box.wrap - 40);
        const labels = await labelLayout(page);
        expect(labels.filter((l) => l.broken.length > 0).map((l) => `${l.text}: ${l.broken}`)).toEqual([]);
        // the field names keep one line: each is one word, and the table has room for it
        expect(labels.filter((l) => ROWS.includes(l.text) && l.lines > 1).map((l) => l.text)).toEqual([]);
        // something gives: a label or the value's name wraps between words
        expect(labels.filter((l) => l.lines > 1).length).toBeGreaterThan(0);
    });

    test("many value columns: the table is wider than the report, the labels are capped and a value stays in view", async ({ page }) => {
        await report(page, servicesCsv(240, 24, 40, LONG_SERVICES), { rows: ["serviceName", "deploymentRegion"], cols: ["costCenter"] });
        const box = await tableBox(page);
        expect(box.table).toBeGreaterThan(box.wrap);
        expect(box.values).toBeGreaterThan(0);
        // the two label columns together take at most 40 % of the box (the cap's share)
        const labelsWide = await page.evaluate(() => {
            const last = [...document.querySelectorAll(".pk-table thead tr")].at(-1);
            return [...last.querySelectorAll("th.pk-corner")].reduce((s, th) => s + th.getBoundingClientRect().width, 0);
        });
        expect(labelsWide).toBeLessThanOrEqual(box.wrap * 0.45);
        const labels = await labelLayout(page);
        expect(labels.filter((l) => l.broken.length > 0).map((l) => `${l.text}: ${l.broken}`)).toEqual([]);
        // the cap bites: a long service name gets less than its natural width and wraps
        expect(labels.filter((l) => LONG_SERVICES.includes(l.text) && l.lines > 1).length).toBeGreaterThan(0);
    });
});

test.describe("at 390 x 844 (a phone)", () => {
    test("two row fields and one value: a value stays in view, the capped table fills the box, no word broken that fits", async ({ page }) => {
        // the fields are placed at desktop width (on a phone they are in a drawer), then the window narrows
        await page.setViewportSize({ width: 1440, height: 900 });
        await report(page, servicesCsv(48, 24), { rows: ["serviceName", "deploymentRegion"] });
        await page.setViewportSize({ width: 390, height: 844 });
        await settled(page);
        await expect.poll(async () => (await tableBox(page)).values).toBeGreaterThan(0);
        // too wide even with every label wrapped between words: capped, and the caps fill the box
        const box = await tableBox(page);
        expect(box.table).toBeLessThanOrEqual(box.wrap + 0.5);
        expect(box.table).toBeGreaterThan(box.wrap - 24);
        const labels = await labelLayout(page);
        expect(labels.filter((l) => l.broken.length > 0).map((l) => `${l.text}: ${l.broken}`)).toEqual([]);
    });

    test("one short row field and a long value name: the name wraps only between words and takes the room the table has", async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await report(page, servicesCsv(48, 24), { rows: ["environmentType"] });
        await page.setViewportSize({ width: 390, height: 844 });
        await settled(page);
        const box = await tableBox(page);
        expect(box.table).toBeLessThanOrEqual(box.wrap + 0.5);
        const name = (await labelLayout(page)).find((l) => l.text === "Sum of monthlyCost");
        // "Sum of" and "monthlyCost": two lines at most, not a narrow column of three
        expect(name.broken).toEqual([]);
        expect(name.lines).toBeLessThanOrEqual(2);
    });
});

test("the choice settles at every width: no state flips back and forth while the window does not change", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await report(page, servicesCsv(48, 24, 4, SPACED_SERVICES), { values: ["cost"] });
    // classic scroll bars that take room, where the engine lets a page set them (not Firefox): the
    // box's width must not change with the state, or a state could take its own room away
    await page.addStyleTag({ content: ".pk-table-wrap::-webkit-scrollbar { width: 15px; height: 15px; background: #ddd; }" });
    // the widths from what this browser measures: from where the natural table stops fitting, down
    // in steps of 20 px through wrapping between words to the caps
    const { table, wrap } = await tableBox(page);
    const start = Math.ceil(1440 - wrap + table) + 20;
    const widths = [1440];
    for (let w = start; w > 390; w -= 20) widths.push(w);
    widths.push(390);
    // past the caps' first widths, only a phone: the steps between add nothing
    let capped = 0;
    const states = new Set();
    for (const width of widths) {
        if (capped >= 3 && width !== widths.at(-1)) continue;
        await page.setViewportSize({ width, height: 900 });
        await settled(page);
        // half a second without a change of the table's state once the layout has settled
        const watched = await page.evaluate(
            () =>
                new Promise((done) => {
                    const table = document.querySelector(".pk-table");
                    let changes = 0;
                    const mo = new MutationObserver((list) => (changes += list.length));
                    mo.observe(table, { attributes: true, attributeFilter: ["data-pk-labels", "style"] });
                    setTimeout(() => {
                        mo.disconnect();
                        done({ changes, state: table.getAttribute("data-pk-labels") ?? "capped" });
                    }, 500);
                })
        );
        expect(watched.changes, `changes at ${width} px`).toBe(0);
        states.add(watched.state);
        if (watched.state === "capped") capped++;
    }
    // the sweep passes all three states
    expect([...states].sort()).toEqual(["capped", "natural", "share"]);
});

test("a new font size alone (a host's --pk-font-size) decides again: natural or share only while the table fits", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await report(page, servicesCsv(48, 24), { values: ["cost"] });
    /** The table's state, and whether its box scrolls sideways. */
    const state = () => page.evaluate(() => {
        const wrap = document.querySelector(".pk-table-wrap");
        return { labels: document.querySelector(".pk-table").getAttribute("data-pk-labels") ?? "capped", scrolls: wrap.scrollWidth > wrap.clientWidth };
    });
    expect(await state()).toEqual({ labels: "natural", scrolls: false });
    // larger: the natural table no longer fits; nothing else changed size
    const style = await page.addStyleTag({ content: ".pk-root { --pk-font-size: 21px; }" });
    await expect.poll(async () => (await state()).labels).not.toBe("natural");
    const larger = await state();
    expect(larger.labels === "capped" || !larger.scrolls, JSON.stringify(larger)).toBe(true);
    // back: natural again
    await style.evaluate((el) => el.remove());
    await expect.poll(state).toEqual({ labels: "natural", scrolls: false });
});

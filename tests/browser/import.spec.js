// Loading data in the browser (allowImport, issue #44): a file dropped onto the report or picked
// through the Data menu, read (in a worker where the reader allows it, with progress and Cancel),
// previewed with its sheet, first rows, a type per column and the readers' notes, then loaded; the
// Data button's dot and the source line while a file's data is shown; Undo, Redo and "Back to
// original data"; saved views per file; the element under a strict CSP with its worker and
// pivotkit-xlsx's dist/ as a plugin; the React host page that renders again all the time.
//
// Files are real: CSV and JSON text, workbooks built by pivotkit-xlsx's test generator. A drop is a
// real DataTransfer holding a File, dispatched as dragenter, dragover and drop.
import { test as plain } from "@playwright/test";
import { chips, drag, expect, tableRows, test, toolbar } from "./fixtures.js";
import { makeXlsx } from "../../packages/pivotkit-xlsx/test/make-xlsx.js";

const TICKETS = "Id;Team;Opened;Hours;Zip\n1001;Network;10.11.2026;1,5;01067\n1002;Server;11.11.2026;2,25;10115\n1003;Network;12.11.2026;4;01067\n\n1004;Client;13.11.2026;0,5;20095\n";
const CSV = "text/csv";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** A file for the page: its name, type and content (text, or bytes as base64). */
const fileOf = (name, type, content) => ({ name, type, ...(typeof content === "string" ? { text: content } : { base64: Buffer.from(content).toString("base64") }) });

/**
 * Drags files over the report and drops them, as a browser does with files from the desktop:
 * dragenter, dragover (the overlay shows), then drop, all with one DataTransfer holding the files.
 * `drop: false` drags them out again instead.
 */
async function dropFiles(page, target, files, { drop = true, expectOverlay = true } = {}) {
    const dt = await page.evaluateHandle((list) => {
        const t = new DataTransfer();
        for (const f of list) {
            const content = f.text ?? Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0));
            t.items.add(new File([content], f.name, { type: f.type }));
        }
        return t;
    }, files);
    const box = await target.boundingBox();
    const at = { clientX: box.x + box.width / 2, clientY: box.y + box.height / 2 };
    await target.dispatchEvent("dragenter", { dataTransfer: dt, ...at });
    await target.dispatchEvent("dragover", { dataTransfer: dt, ...at });
    if (expectOverlay) {
        await expect(page.getByTestId("drop-overlay")).toBeVisible();
    }
    await target.dispatchEvent(drop ? "drop" : "dragleave", { dataTransfer: dt, ...at });
    await expect(page.getByTestId("drop-overlay")).toHaveCount(0);
}

/** The field names of the field list. */
const fieldNames = (scope) => scope.locator(".pk-field-list [data-field]").evaluateAll((els) => els.map((e) => e.getAttribute("data-field")));

/** The preview table: its header cells (column names) and body rows as texts. */
async function preview(dialog) {
    await expect(dialog.getByTestId("import-preview")).toBeVisible();
    return dialog.getByTestId("import-preview").evaluate((box) => ({
        columns: [...box.querySelectorAll("thead th")].map((th) => th.firstChild.textContent),
        types: [...box.querySelectorAll("thead select")].map((s) => s.value),
        rows: [...box.querySelectorAll("tbody tr")].map((tr) => [...tr.children].map((td) => td.textContent))
    }));
}

test("a CSV dropped onto the report: the overlay, the preview with types and notes, Load data; Undo and Redo move between the data", async ({ page }) => {
    await page.goto("?data=sales&import");
    await expect(page.getByTestId("pivot-table")).toBeVisible();
    const before = await fieldNames(page);
    // the overlay says where to let go and what the report reads; the data stays until the preview says so
    const dt = { name: "tickets.csv", type: CSV, text: TICKETS };
    // a CSV is read in the playground's module worker (its importWorker), off the page
    const worker = page.waitForEvent("worker", { timeout: 10_000 });
    await dropFiles(page, page.getByTestId("pivot-table"), [dt]);
    expect((await worker).url()).toMatch(/\/import-worker\.js$/);
    const dialog = page.getByTestId("import-dialog");
    await expect(dialog).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Load tickets.csv" })).toBeVisible();
    const p = await preview(dialog);
    expect(p.columns).toEqual(["Id", "Team", "Opened", "Hours", "Zip"]);
    // German numbers with a semicolon, dates before numbers, a leading zero keeps the postcode text
    expect(p.types).toEqual(["number", "string", "date", "number", "string"]);
    expect(p.rows[0]).toEqual(["1,001", "Network", "2026-11-10", "1.5", "01067"]);
    expect(p.rows).toHaveLength(4);
    await expect(dialog.getByTestId("import-meta")).toHaveText(/4 rows · 5 columns/);
    // the readers' notes, in words: the encoding, the separator, the empty row
    const notes = dialog.getByTestId("import-notes");
    await expect(notes.locator("li[data-code='ROWS_EMPTY']")).toHaveText("1 empty row was left out.");
    await expect(notes.locator("li[data-code='SEPARATOR']")).toContainText("semicolon");
    // the focus is on Load data: Enter loads, Tab reaches the types
    await expect(dialog.getByTestId("import-apply")).toBeFocused();
    // the Id as text: its values as the file has them, not as numbers
    await dialog.getByTestId("import-type-0").selectOption("string");
    expect((await preview(dialog)).rows.map((r) => r[0])).toEqual(["1001", "1002", "1003", "1004"]);
    // Hours as a date: no value is a date; they are empty, a note counts them
    await dialog.getByTestId("import-type-3").selectOption("date");
    expect((await preview(dialog)).rows.map((r) => r[3])).toEqual(["", "", "", ""]);
    await expect(notes.locator("li[data-code='VALUES_NOT_CONVERTED']")).toHaveText("4 values in “Hours” cannot be read as Date and are empty.");
    await dialog.getByTestId("import-type-3").selectOption("number");
    await expect(notes.locator("li[data-code='VALUES_NOT_CONVERTED']")).toHaveCount(0);
    await dialog.getByTestId("import-apply").click();
    await expect(dialog).toHaveCount(0);
    // the file's columns, the source line under the result, the dot on Data, a note with Undo
    await expect.poll(() => fieldNames(page)).toEqual(["Id", "Team", "Opened", "Hours", "Zip"]);
    await expect(page.getByTestId("source-line")).toHaveText("tickets.csv, only in this browser");
    await expect(page.getByTestId("data-loaded")).toHaveCount(1);
    await expect(page.locator(".pk-toast").first()).toContainText("tickets.csv loaded: 4 rows, 5 columns");
    await expect(page.getByTestId("pg-last-load")).toHaveText("onDataLoad: load, tickets.csv, 4 rows, 5 columns");
    // the Id is text now: a report on it counts teams per Id
    await drag(page, page.locator('.pk-field[data-field="Team"]'), page.locator('[data-zone="rows"]'));
    await expect.poll(() => chips(page, "rows")).toEqual(["Team"]);
    expect((await tableRows(page)).slice(0, 3).map((r) => r[0])).toEqual(["Client", "Network", "Server"]);
    // Undo: the step on the file, then the load itself; the playground's data and view come back
    await page.getByTestId("undo").click();
    await expect.poll(() => chips(page, "rows")).toEqual([]);
    await page.getByTestId("undo").click();
    await expect.poll(() => fieldNames(page)).toEqual(before);
    await expect(page.getByTestId("source-line")).toHaveCount(0);
    await expect(page.getByTestId("data-loaded")).toHaveCount(0);
    await expect(page.locator(".pk-toast").last()).toContainText("Undone: tickets.csv loaded");
    await expect(page.getByTestId("pg-last-load")).toContainText("onDataLoad: undo, Sales");
    // Redo: the file again, then its step
    await page.getByTestId("redo").click();
    await expect.poll(() => fieldNames(page)).toEqual(["Id", "Team", "Opened", "Hours", "Zip"]);
    await page.getByTestId("redo").click();
    await expect.poll(() => chips(page, "rows")).toEqual(["Team"]);
});

/** Opens the Data menu: its own button, or its entry in "More". */
async function dataMenu(scope) {
    const own = scope.getByTestId("data");
    if (await own.count()) {
        await own.click();
    } else {
        await scope.getByTestId("more").click();
        await scope.getByTestId("more-data").click();
    }
    await expect(scope.getByTestId("data-menu")).toBeVisible();
}

/** Picks a file through the Data menu's "Load data…" and the browser's file chooser. */
async function pickThroughMenu(page, scope, file) {
    await dataMenu(scope);
    const chooser = page.waitForEvent("filechooser");
    await scope.getByTestId("load-file").click();
    await (await chooser).setFiles({ name: file.name, mimeType: file.type, buffer: file.base64 ? Buffer.from(file.base64, "base64") : Buffer.from(file.text) });
}

test("the Data menu by keyboard: where the data comes from, Load data… opens the file chooser, Escape cancels the preview and the focus goes back", async ({ page }) => {
    await page.goto("?data=sales&import");
    await expect(page.getByTestId("pivot-table")).toBeVisible();
    const data = page.getByTestId("data");
    // Data stands before Views
    const [d, v] = [await data.boundingBox(), await page.getByTestId("views").boundingBox()];
    expect(d.x + d.width).toBeLessThanOrEqual(v.x);
    await data.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("data-menu")).toBeVisible();
    await expect(page.getByTestId("data-name")).toHaveText("Sales");
    await expect(page.getByTestId("data-size")).toHaveText(/^4,000 rows × \d+ columns$/);
    await expect(page.getByTestId("drop-hint")).toHaveText("or drop a file onto the report. Reads Excel workbook, CSV or text, and JSON");
    // the first entry takes the focus once the menu is there; no Back while the playground's data is shown
    await expect(page.getByTestId("load-file")).toBeFocused();
    await expect(page.getByTestId("back-to-original")).toHaveCount(0);
    const chooser = page.waitForEvent("filechooser");
    await page.keyboard.press("Enter");
    const fc = await chooser;
    // the chooser offers what the readers read
    expect(await page.getByTestId("file-input").getAttribute("accept")).toBe(".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.csv,.tsv,.txt,.tab,text/csv,text/tab-separated-values,text/plain,.json,application/json");
    await fc.setFiles({ name: "tickets.csv", mimeType: CSV, buffer: Buffer.from(TICKETS) });
    const dialog = page.getByRole("dialog", { name: "Load tickets.csv" });
    await expect(dialog.getByTestId("import-apply")).toBeFocused();
    // Tab stays in the dialog: Load data is its last stop, Cancel before it, the types before that
    await page.keyboard.press("Tab");
    await expect(dialog.getByTestId("import-type-0")).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(dialog.getByTestId("import-apply")).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(dialog.getByTestId("import-cancel")).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(dialog.getByTestId("import-type-4")).toBeFocused();
    // Escape: nothing loaded, the focus back on Data
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(data).toBeFocused();
    await expect(page.getByTestId("source-line")).toHaveCount(0);
    await expect(page.getByTestId("pg-last-load")).toHaveText("");
});

test("saved views stay with their file: Back to original data, the same file again finds its view, another file not", async ({ page }) => {
    await page.goto("?data=sales&import");
    await expect(page.getByTestId("pivot-table")).toBeVisible();
    const tickets = { name: "tickets.csv", type: CSV, text: TICKETS };
    await pickThroughMenu(page, page, tickets);
    await page.getByTestId("import-apply").click();
    await drag(page, page.locator('.pk-field[data-field="Team"]'), page.locator('[data-zone="rows"]'));
    await toolbar(page, "views");
    await page.getByTestId("save-as").click();
    await page.getByTestId("saved-view-name").fill("Tickets by team");
    await page.getByTestId("saved-view-name").press("Enter");
    await expect(page.locator(".pk-toasts")).toContainText("View “Tickets by team” saved");
    // the view file of the store names the file and its columns
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("pivotkit:views:playground")));
    const saved = stored.find((f) => f.name === "Tickets by team");
    expect(saved.source.id).toMatch(/^tickets\.csv#[0-9a-f]{16}$/);
    // Back to original data: the playground's data with the view it had, without the file's views
    await dataMenu(page);
    await expect(page.getByTestId("data-name")).toHaveText("tickets.csv");
    await expect(page.getByTestId("data-size")).toHaveText("4 rows × 5 columns");
    await page.getByTestId("back-to-original").click();
    await expect(page.getByTestId("source-line")).toHaveCount(0);
    await expect(page.getByTestId("pivot-table")).toBeVisible();
    await expect.poll(() => chips(page, "rows")).not.toEqual(["Team"]);
    await expect(page.locator(".pk-toast").last()).toContainText("The original data is shown");
    await toolbar(page, "views");
    await expect(page.getByTestId("saved-view-Tickets by team")).toHaveCount(0);
    await page.keyboard.press("Escape");
    // the same file again: its view is offered
    await pickThroughMenu(page, page, tickets);
    await page.getByTestId("import-apply").click();
    await toolbar(page, "views");
    await expect(page.getByTestId("saved-view-Tickets by team")).toHaveCount(1);
    await page.keyboard.press("Escape");
    // the same name with other columns is other data
    await pickThroughMenu(page, page, { name: "tickets.csv", type: CSV, text: "Team;Hours\nNetwork;1\n" });
    await page.getByTestId("import-apply").click();
    await toolbar(page, "views");
    await expect(page.getByTestId("saved-view-Tickets by team")).toHaveCount(0);
});

test("an Excel workbook through pivotkit-xlsx: the sheet to read, its first rows and the notes in German", async ({ page }) => {
    await page.goto("?data=sales&lang=de&import");
    await expect(page.getByTestId("pivot-table")).toBeVisible();
    const bytes = makeXlsx({
        sheets: [
            { name: "Inventar", rows: [["Hostname", "Team", "In Betrieb seit"], ["srv-01", "Server", { date: new Date(Date.UTC(2024, 1, 3)) }], ["nb-02", "Client", { date: new Date(Date.UTC(2025, 8, 11)) }]], usedRangeTo: 5_000 },
            { name: "Legende", rows: [["Begriff", "Bedeutung"], ["Server", "Rechenzentrum"]] },
            { name: "Intern", hidden: true, rows: [["x"], [1]] }
        ]
    });
    await dropFiles(page, page.getByTestId("pivot-table"), [fileOf("Assets.xlsx", XLSX, bytes)]);
    const dialog = page.getByRole("dialog", { name: "Assets.xlsx laden" });
    expect((await preview(dialog)).columns).toEqual(["Hostname", "Team", "In Betrieb seit"]);
    expect((await preview(dialog)).types).toEqual(["string", "string", "date"]);
    expect((await preview(dialog)).rows[0]).toEqual(["srv-01", "Server", "2024-02-03"]);
    await expect(dialog.locator("li[data-code='SHEET']")).toHaveText("Gelesen wurde das Blatt „Inventar“ von 3 Blättern.");
    await expect(dialog.locator("li[data-code='USED_RANGE']")).toHaveText("Der benutzte Bereich des Blatts reicht bis Zeile 5.000; die Werte enden in Zeile 3, die leeren Zeilen darunter wurden übersprungen.");
    // the sheets, a hidden one marked; another sheet reads the file again
    const sheet = dialog.getByTestId("import-sheet");
    await expect(sheet.locator("option")).toHaveText(["Inventar", "Legende", "Intern (ausgeblendet)"]);
    await expect(sheet).toHaveAccessibleName("Blatt");
    await sheet.selectOption({ label: "Legende" });
    await expect.poll(async () => (await preview(dialog)).columns).toEqual(["Begriff", "Bedeutung"]);
    await expect(dialog.getByTestId("import-meta")).toHaveText(/^1 Zeile · 2 Spalten · /);
    await dialog.getByTestId("import-apply").click();
    await expect.poll(() => fieldNames(page)).toEqual(["Begriff", "Bedeutung"]);
    await expect(page.getByTestId("source-line")).toHaveText("Assets.xlsx, Blatt „Legende“, nur in diesem Browser");
});

test("a file that cannot be read says why with the reader's message; the data stays. Two files at once are refused", async ({ page }) => {
    await page.goto("?data=sales&import");
    await expect(page.getByTestId("pivot-table")).toBeVisible();
    const before = await fieldNames(page);
    await dropFiles(page, page.getByTestId("pivot-table"), [{ name: "broken.csv", type: CSV, text: 'a,b\n1,"open\n2,3\n' }]);
    await expect(page.locator(".pk-toast.pk-error")).toHaveText('broken.csv could not be loaded: the quote that opens a value in line 2 is never closed.');
    await expect(page.getByTestId("import-dialog")).toHaveCount(0);
    await expect.poll(() => fieldNames(page)).toEqual(before);
    // a workbook with macros is refused by the plugin before anything is parsed
    await dropFiles(page, page.getByTestId("pivot-table"), [fileOf("budget.xlsx", XLSX, makeXlsx({ sheets: [{ name: "S", rows: [["A"], [1]] }], macros: true }))]);
    await expect(page.locator(".pk-toast.pk-error").last()).toContainText("the workbook holds macros");
    // a format no reader takes
    await dropFiles(page, page.getByTestId("pivot-table"), [{ name: "slides.pdf", type: "application/pdf", text: "%PDF-1.7" }]);
    await expect(page.locator(".pk-toast.pk-error").last()).toContainText("no reader for this kind of file");
    // two files: one at a time
    await page.locator(".pk-toast-x").first().click();
    await dropFiles(page, page.getByTestId("pivot-table"), [{ name: "a.csv", type: CSV, text: "x\n1\n" }, { name: "b.csv", type: CSV, text: "y\n2\n" }]);
    await expect(page.locator(".pk-toast.pk-error").last()).toHaveText(/Drop one file at a time\./);
    await expect.poll(() => fieldNames(page)).toEqual(before);
    // a drag that leaves again changes nothing
    await dropFiles(page, page.getByTestId("pivot-table"), [{ name: "a.csv", type: CSV, text: "x\n1\n" }], { drop: false });
    await expect(page.getByTestId("import-dialog")).toHaveCount(0);
});

test("a large file shows its progress and Cancel stops it; the data stays", async ({ page }) => {
    await page.goto("?data=sales&import");
    await expect(page.getByTestId("pivot-table")).toBeVisible();
    const before = await fieldNames(page);
    // about 30 MB of CSV: long enough to show the progress and to cancel it
    const dt = await page.evaluateHandle(() => {
        const line = "2026-11-10T08:30:00;Network;Open;1234.5;some longer description text of a ticket\n";
        const t = new DataTransfer();
        t.items.add(new File(["When;Team;State;Hours;Text\n", line.repeat(400_000)], "big.csv", { type: "text/csv" }));
        return t;
    });
    const table = page.getByTestId("pivot-table");
    await table.dispatchEvent("dragenter", { dataTransfer: dt });
    await table.dispatchEvent("dragover", { dataTransfer: dt });
    await table.dispatchEvent("drop", { dataTransfer: dt });
    const dialog = page.getByRole("dialog", { name: "Load big.csv" });
    await expect(dialog.getByTestId("import-progress")).toBeVisible();
    await expect(dialog.getByRole("progressbar")).toBeVisible();
    await expect(dialog).toHaveAttribute("aria-busy", "true");
    await expect(dialog.getByTestId("import-cancel")).toBeFocused();
    await dialog.getByTestId("import-cancel").click();
    await expect(dialog).toHaveCount(0);
    await expect.poll(() => fieldNames(page)).toEqual(before);
    await expect(page.getByTestId("pg-last-load")).toHaveText("");
});

test("on a phone: Data in More, the preview fits the window, Load data", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("?data=sales&import");
    await expect(page.getByTestId("pivot-table")).toBeVisible();
    await pickThroughMenu(page, page, { name: "tickets.csv", type: CSV, text: TICKETS });
    const dialog = page.getByTestId("import-dialog");
    await expect(dialog.getByTestId("import-apply")).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await dialog.getByTestId("import-apply").click();
    await expect(page.getByTestId("source-line")).toBeVisible();
    // Data is in More on a phone: the dot is on More
    await expect(page.getByTestId("data")).toHaveCount(0);
    await expect(page.getByTestId("more-loaded")).toHaveCount(1);
});

/** The element's page under a strict CSP, once the plugin is set. */
async function elementPage(page, query = "") {
    await page.goto(`pages/element-import.html${query}`);
    await page.waitForFunction(() => window.__ready === true);
    return page.locator("pivot-report");
}

/**
 * A test of the element's page under a strict CSP: no console error and no violation of the policy.
 * One exception, WebKit's own: it reports a style-src-attr violation (and its console error) for every
 * native <select> it creates, a page's own as well (the control below), never for the report's code:
 * exactly one per <select> the report made, none in Chromium and Firefox.
 */
function strict(name, body) {
    plain(name, async ({ page, browserName }) => {
        const problems = [];
        page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && problems.push(m.text()));
        page.on("pageerror", (e) => problems.push(e.message));
        await body({ page });
        const { violations, selects } = await page.evaluate(() => ({ violations: window.__violations, selects: window.__selects }));
        if (browserName === "webkit") {
            const own = (text) => text.startsWith("Refused to apply a stylesheet because its hash, its nonce, or 'unsafe-inline' does not appear in the style-src directive");
            expect(violations.every((v) => v === "style-src-attr: inline")).toBe(true);
            expect(violations.length).toBe(selects);
            expect(problems.filter((p) => !own(p))).toEqual([]);
            // the control: a page's own <select>, without pivotkit, is reported the same way
            const before = violations.length;
            await page.evaluate(() => document.body.append(document.createElement("select")));
            await expect.poll(() => page.evaluate(() => window.__violations.length)).toBe(before + 1);
        } else {
            expect(violations).toEqual([]);
            expect(problems).toEqual([]);
        }
    });
}

strict("the element under a strict CSP: a CSV read in its own worker, a workbook through pivotkit-xlsx's dist/, pivot-data-load, no violation", async ({ page }) => {
    const report = await elementPage(page);
    await expect(report.getByTestId("pivot-table")).toBeVisible();
    const worker = page.waitForEvent("worker", { timeout: 10_000 });
    await dropFiles(page, report.getByTestId("pivot-table"), [{ name: "tickets.csv", type: CSV, text: TICKETS }]);
    expect((await worker).url()).toMatch(/\/packages\/pivotkit-element\/dist\/import-worker\.js$/);
    await report.getByTestId("import-apply").click();
    await expect.poll(() => fieldNames(report)).toEqual(["Id", "Team", "Opened", "Hours", "Zip"]);
    let loads = await page.evaluate(() => window.__loads);
    expect(loads).toHaveLength(1);
    expect(loads[0]).toMatchObject({ cause: "load", rows: 4, sheet: null, file: { name: "tickets.csv", size: TICKETS.length, type: CSV } });
    expect(loads[0].source.id).toMatch(/^tickets\.csv#[0-9a-f]{16}$/);
    expect(loads[0].columns.map((c) => c.type)).toEqual(["number", "string", "date", "number", "string"]);
    expect(loads[0].notes.map((n) => n.code)).toContain("ROWS_EMPTY");
    // a workbook, through the plugin the page set as a property
    await pickThroughMenu(page, report, fileOf("assets.xlsx", XLSX, makeXlsx({ sheets: [{ name: "Assets", rows: [["Host", "Cost"], ["a", 1], ["b", 2]] }] })));
    await report.getByTestId("import-apply").click();
    await expect.poll(() => fieldNames(report)).toEqual(["Host", "Cost"]);
    await expect(report.getByTestId("source-line")).toHaveText("assets.xlsx, sheet “Assets”, only in this browser");
    // Back to original data: the page's own source
    await dataMenu(report);
    await report.getByTestId("back-to-original").click();
    loads = await page.evaluate(() => window.__loads);
    expect(loads.at(-1)).toMatchObject({ cause: "original", source: { id: "sales", name: "Sales" }, file: null, rows: 1000 });
});

plain("a policy that refuses workers: the element reads the file on the page and loads it", async ({ page }) => {
    const problems = [];
    page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && problems.push(m.text()));
    await page.goto("pages/element-import-noworker.html");
    await page.waitForFunction(() => window.__ready === true);
    const report = page.locator("pivot-report");
    await expect(report.getByTestId("pivot-table")).toBeVisible();
    await dropFiles(page, report.getByTestId("pivot-table"), [{ name: "tickets.csv", type: CSV, text: TICKETS }]);
    await report.getByTestId("import-apply").click();
    await expect.poll(() => fieldNames(report)).toEqual(["Id", "Team", "Opened", "Hours", "Zip"]);
    // the browser says it refused the worker; nothing else went wrong
    const violations = await page.evaluate(() => window.__violations);
    expect(violations.some((v) => v.startsWith("worker-src"))).toBe(true);
    expect(violations.filter((v) => !v.startsWith("worker-src") && v !== "style-src-attr: inline")).toEqual([]);
    expect(problems.filter((p) => !/worker|Worker|style-src/.test(p))).toEqual([]);
});

strict("the element: preventDefault() on pivot-data-load refuses the file, the data stays", async ({ page }) => {
    const report = await elementPage(page, "?refuse");
    await expect(report.getByTestId("pivot-table")).toBeVisible();
    await expect.poll(() => fieldNames(report).then((f) => f.length)).toBeGreaterThan(3);
    const before = await fieldNames(report);
    await dropFiles(page, report.getByTestId("pivot-table"), [{ name: "tickets.csv", type: CSV, text: TICKETS }]);
    await report.getByTestId("import-apply").click();
    await expect(report.getByTestId("import-dialog")).toHaveCount(0);
    await expect.poll(() => fieldNames(report)).toEqual(before);
    await expect(report.getByTestId("source-line")).toHaveCount(0);
    await expect(report.getByTestId("undo")).toBeDisabled();
    expect((await page.evaluate(() => window.__loads)).map((l) => l.cause)).toEqual(["load"]);
});

strict("the element takes columnar data; without data, the empty report offers to load a file", async ({ page }) => {
    let report = await elementPage(page, "?columnar");
    await expect.poll(() => fieldNames(report)).toEqual(["Team", "Hours"]);
    await drag(page, report.locator('.pk-field[data-field="Team"]'), report.locator('[data-zone="rows"]'));
    expect((await tableRows(report)).slice(0, 2).map((r) => r[0])).toEqual(["Network", "Server"]);
    report = await elementPage(page, "?empty");
    await expect(report.getByTestId("empty-state").getByRole("heading")).toHaveText("Load data to start");
    await expect(report.getByTestId("empty-drop")).toContainText("Drop a file onto the report, or");
    const chooser = page.waitForEvent("filechooser");
    await report.getByTestId("empty-load").click();
    await (await chooser).setFiles({ name: "teams.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ data: [{ Team: "A", Hours: 2 }, { Team: "B", Hours: 3 }] })) });
    await expect(report.getByTestId("import-notes").locator("li[data-code='JSON_PROPERTY']")).toHaveText("The rows were read from “data”.");
    await report.getByTestId("import-apply").click();
    await expect.poll(() => fieldNames(report)).toEqual(["Team", "Hours"]);
});

test("a host that renders again all the time (React from an import map, no worker): the read goes on, the dialog keeps its state", async ({ page }) => {
    await page.goto("pages/host.html?import");
    await expect(page.getByTestId("pivot-table")).toBeVisible();
    await expect.poll(() => page.getByTestId("host-renders").textContent().then(Number)).toBeGreaterThan(2);
    // no worker: the file is read on the page
    let workers = 0;
    page.on("worker", () => (workers += 1));
    await dropFiles(page, page.getByTestId("pivot-table"), [{ name: "tickets.csv", type: CSV, text: TICKETS }]);
    const dialog = page.getByTestId("import-dialog");
    await dialog.getByTestId("import-type-0").selectOption("string");
    // the host renders again with new plugins and callbacks: the preview keeps the type picked
    const n = Number(await page.getByTestId("host-renders").textContent());
    await expect.poll(() => page.getByTestId("host-renders").textContent().then(Number)).toBeGreaterThan(n + 2);
    expect((await preview(dialog)).types[0]).toBe("string");
    await dialog.getByTestId("import-apply").click();
    await expect.poll(() => fieldNames(page)).toEqual(["Id", "Team", "Opened", "Hours", "Zip"]);
    expect(workers).toBe(0);
    const loads = await page.evaluate(() => window.__loads);
    expect(loads.map((l) => l.cause)).toEqual(["load"]);
    expect(loads[0].columns[0]).toEqual({ name: "Id", type: "string" });
    // a workbook through pivotkit-xlsx's dist/ from the import map
    await pickThroughMenu(page, page, fileOf("assets.xlsx", XLSX, makeXlsx({ sheets: [{ name: "Assets", rows: [["Host"], ["a"]] }] })));
    await page.getByTestId("import-apply").click();
    await expect.poll(() => fieldNames(page)).toEqual(["Host"]);
});

test("importLimits (issue #169): the host's 2,000 rows stay while a file over the import limits is refused with the limit named; a key it leaves out is the host's limits", async ({ page }) => {
    // the host: importLimits { rows: 1000 } and limits { columns: 4 }, new objects on every render
    await page.goto("pages/host.html?import&importlimits");
    await expect(page.getByTestId("pivot-table")).toBeVisible();
    await expect.poll(() => page.getByTestId("host-renders").textContent().then(Number)).toBeGreaterThan(2);
    // the host's data is above the import rows and shows: no limit note, its fields, the report's 2,000 rows behind it
    await expect(page.getByText(/more than the limit of/)).toHaveCount(0);
    const hostFields = await fieldNames(page);
    expect(hostFields).toContain("Region");
    await dataMenu(page);
    await expect(page.getByTestId("data-size")).toHaveText(/^2,000 rows × /);
    await page.keyboard.press("Escape");
    const csvOf = (n) => `Team,Hours\n${Array.from({ length: n }, (_, i) => `T${i % 7},${i}`).join("\n")}\n`;
    // a file of 1,001 rows, dropped: refused, the limit named, the host's data stays
    await dropFiles(page, page.getByTestId("pivot-table"), [{ name: "big.csv", type: CSV, text: csvOf(1001) }]);
    await expect(page.locator(".pk-toast.pk-error")).toHaveText(/^big\.csv could not be loaded: .*has more than 1,000 rows \(limits\.rows\)/);
    await expect(page.getByTestId("import-dialog")).toHaveCount(0);
    await expect.poll(() => fieldNames(page)).toEqual(hostFields);
    await page.locator(".pk-toast-x").first().click();
    // five columns: over the host's limits.columns, which importLimits leaves to it
    await pickThroughMenu(page, page, { name: "tickets.csv", type: CSV, text: TICKETS });
    await expect(page.locator(".pk-toast.pk-error")).toHaveText(/^tickets\.csv could not be loaded: .*has more than 4 columns \(limits\.columns\)/);
    await expect.poll(() => fieldNames(page)).toEqual(hostFields);
    await page.locator(".pk-toast-x").first().click();
    // 1,000 rows fit: the preview, Load data, the file's data shown
    await pickThroughMenu(page, page, { name: "fits.csv", type: CSV, text: csvOf(1000) });
    await expect(page.getByTestId("import-meta")).toHaveText(/1,000 rows · 2 columns/);
    await page.getByTestId("import-apply").click();
    await expect.poll(() => fieldNames(page)).toEqual(["Team", "Hours"]);
    expect((await page.evaluate(() => window.__loads)).map((l) => [l.cause, l.rows])).toEqual([["load", 1000]]);
    // Back to original data: the host's 2,000 rows again, under its own limits
    await dataMenu(page);
    await page.getByTestId("back-to-original").click();
    await expect.poll(() => fieldNames(page)).toEqual(hostFields);
    await expect(page.getByText(/more than the limit of/)).toHaveCount(0);
});

strict("the element's importLimits property: the page's 1,000 rows show, a file over the import rows is refused in its worker", async ({ page }) => {
    const report = await elementPage(page, "?importlimits");
    await expect(report.getByTestId("pivot-table")).toBeVisible();
    await expect.poll(() => fieldNames(report).then((f) => f.length)).toBeGreaterThan(3);
    const before = await fieldNames(report);
    await expect(report.getByText(/more than the limit of/)).toHaveCount(0);
    const worker = page.waitForEvent("worker", { timeout: 10_000 });
    await dropFiles(page, report.getByTestId("pivot-table"), [{ name: "tickets.csv", type: CSV, text: TICKETS }]);
    expect((await worker).url()).toMatch(/\/import-worker\.js$/);
    await expect(report.locator(".pk-toast.pk-error")).toHaveText(/^tickets\.csv could not be loaded: .*has more than 3 rows \(limits\.rows\)/);
    await expect(report.getByTestId("import-dialog")).toHaveCount(0);
    await expect.poll(() => fieldNames(report)).toEqual(before);
    expect(await page.evaluate(() => window.__loads)).toEqual([]);
});

test("review fixes: Undo's keys in the preview leave the report behind it alone; no warning about the host's view after a load; a new file closes old error notes", async ({ page }) => {
    await page.goto("?data=sales&import");
    await expect(page.getByTestId("pivot-table")).toBeVisible();
    await page.getByRole("button", { name: "Swap rows and columns" }).click();
    const rowsBefore = await chips(page, "rows");
    // an error note first
    await dropFiles(page, page.getByTestId("pivot-table"), [{ name: "slides.pdf", type: "application/pdf", text: "%PDF" }]);
    await expect(page.locator(".pk-toast.pk-error")).toHaveCount(1);
    await dropFiles(page, page.getByTestId("pivot-table"), [{ name: "tickets.csv", type: CSV, text: TICKETS }]);
    const dialog = page.getByTestId("import-dialog");
    await expect(dialog.getByTestId("import-apply")).toBeFocused();
    // the next file closed the note about the last one
    await expect(page.locator(".pk-toast.pk-error")).toHaveCount(0);
    for (const keys of ["ControlOrMeta+z", "ControlOrMeta+Shift+z", "Control+y"]) {
        await page.keyboard.press(keys);
    }
    await expect(page.locator(".pk-toast")).toHaveCount(0);
    expect(await chips(page, "rows")).toEqual(rowsBefore);
    await expect(dialog).toBeVisible();
    await dialog.getByTestId("import-apply").click();
    await expect(page.getByTestId("source-line")).toBeVisible();
    // the playground's start view has fields the file lacks: no warning about it for the person
    await expect(page.getByTestId("view-issues")).toHaveCount(0);
});

strict("review fixes: a sheet over the limits says so and keeps the sheet list; another sheet keeps the focus on the list", async ({ page }) => {
    await page.goto("pages/element-import.html?limits");
    await page.waitForFunction(() => window.__ready === true);
    const report = page.locator("pivot-report");
    await expect(report.getByTestId("pivot-table")).toBeVisible();
    const book = makeXlsx({ sheets: [{ name: "Small", rows: [["a", "b"], [1, 2]] }, { name: "Large", rows: [["a", "b"], ...Array.from({ length: 8 }, (_, i) => [i, i * 2])] }] });
    await dropFiles(page, report.getByTestId("pivot-table"), [fileOf("two.xlsx", XLSX, book)]);
    const dialog = report.getByTestId("import-dialog");
    await expect(dialog.getByTestId("import-apply")).toBeFocused();
    const sheet = dialog.getByTestId("import-sheet");
    await sheet.focus();
    await sheet.selectOption({ label: "Large" });
    await expect(dialog.getByTestId("import-error")).toContainText("limits.importCells");
    await expect(dialog.getByTestId("import-progress")).toHaveCount(0);
    await expect(dialog.getByTestId("import-apply")).toHaveCount(0);
    await expect(dialog).not.toHaveAttribute("aria-busy", "true");
    await expect(sheet).toBeEnabled();
    await expect(sheet).toBeFocused();
    await sheet.selectOption({ label: "Small" });
    await expect(dialog.getByTestId("import-apply")).toBeVisible();
    await expect(dialog.getByTestId("import-error")).toHaveCount(0);
    // the focus stays where the person is, on the list
    await expect(sheet).toBeFocused();
    await dialog.getByTestId("import-apply").click();
    await expect.poll(() => fieldNames(report)).toEqual(["a", "b"]);
});

strict("a slow first frame (issue #136): the dialog's first focus does not take the focus back from Load data or the sheet list", async ({ page }) => {
    // every frame comes 2 s late, as WebKit's headless frames sometimes do: the file is read and the
    // person is in the dialog before its first frame; a frame asked for later still runs after it
    await page.addInitScript(() => {
        window.requestAnimationFrame = (callback) => window.setTimeout(() => callback(performance.now()), 2000);
        window.cancelAnimationFrame = (id) => window.clearTimeout(id);
    });
    const nextFrame = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined))));
    const report = await elementPage(page, "?limits");
    await expect(report.getByTestId("pivot-table")).toBeVisible();
    const book = makeXlsx({ sheets: [{ name: "Small", rows: [["a", "b"], [1, 2]] }, { name: "Large", rows: [["a", "b"], ...Array.from({ length: 8 }, (_, i) => [i, i * 2])] }] });
    const dialog = report.getByTestId("import-dialog");
    // the first rows are there before the dialog's first frame: "Load data" keeps the focus after it
    await dropFiles(page, report.getByTestId("pivot-table"), [fileOf("two.xlsx", XLSX, book)]);
    await expect(dialog.getByTestId("import-apply")).toBeFocused();
    await nextFrame();
    await expect(dialog.getByTestId("import-apply")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    // the person picks a sheet over the limits before the dialog's first frame: the list keeps the focus
    await dropFiles(page, report.getByTestId("pivot-table"), [fileOf("two.xlsx", XLSX, book)]);
    await expect(dialog.getByTestId("import-apply")).toBeFocused();
    const sheet = dialog.getByTestId("import-sheet");
    await sheet.focus();
    await sheet.selectOption({ label: "Large" });
    await expect(dialog.getByTestId("import-error")).toContainText("limits.importCells");
    await nextFrame();
    await expect(sheet).toBeFocused();
});

test("review fixes: the formats in German; the empty report without data says it once", async ({ page }) => {
    await page.goto("?data=sales&lang=de&import");
    await expect(page.getByTestId("pivot-table")).toBeVisible();
    await dataMenu(page);
    await expect(page.getByTestId("drop-hint")).toHaveText("oder eine Datei auf den Bericht ziehen. Liest Excel-Arbeitsmappe, CSV oder Text und JSON");
    await page.goto("pages/element-import.html?empty");
    await page.waitForFunction(() => window.__ready === true);
    await expect(page.locator("pivot-report").getByTestId("empty-drop")).toContainText("Drop a file onto the report, or");
});

const TICKET_FIELDS = ["Id", "Team", "Opened", "Hours", "Zip"];

/** Clicks a host button that mounts the report again and waits until the report shown is a new one. */
async function mountAgain(page, button, scope = page) {
    const old = await scope.locator(".pk-root").first().elementHandle();
    await page.getByTestId(button).click();
    await expect.poll(() => old.evaluate((n) => n.isConnected)).toBe(false);
    await expect(scope.locator(".pk-root").first()).toBeVisible();
}

for (const [title, query] of [["", ""], [", a host that passes the view back a moment later", "&asyncecho"]]) {
test(`a host that mounts the report again (PowerShell Universal's theme switch)${title}: the loaded file comes back with its view and its undo steps`, async ({ page }) => {
    await page.goto(`pages/host.html?import&remount${query}`);
    await expect(page.getByTestId("pivot-table")).toBeVisible();
    const before = await fieldNames(page);
    const hostChips = await chips(page, "rows");
    await dropFiles(page, page.getByTestId("pivot-table"), [{ name: "tickets.csv", type: CSV, text: TICKETS }]);
    await page.getByTestId("import-apply").click();
    await expect.poll(() => fieldNames(page)).toEqual(TICKET_FIELDS);
    await drag(page, page.locator('.pk-field[data-field="Team"]'), page.locator('[data-zone="rows"]'));
    await expect.poll(() => chips(page, "rows")).toEqual(["Team"]);
    const table = await tableRows(page);
    expect(table.slice(0, 3).map((r) => r[0])).toEqual(["Client", "Network", "Server"]);
    // the host mounts the report again and starts its own (controlled) view again, as PSU does
    await mountAgain(page, "host-remount");
    await expect.poll(() => fieldNames(page)).toEqual(TICKET_FIELDS);
    await expect(page.getByTestId("source-line")).toHaveText("tickets.csv, only in this browser");
    await expect(page.getByTestId("data-loaded")).toHaveCount(1);
    await expect.poll(() => chips(page, "rows")).toEqual(["Team"]);
    expect(await tableRows(page)).toEqual(table);
    // the host hears that the file is shown again, before the view it shows
    const loads = await page.evaluate(() => window.__loads);
    expect(loads.map((l) => l.cause)).toEqual(["load", "restore"]);
    expect(loads[1]).toMatchObject({ source: { name: "tickets.csv" }, file: { name: "tickets.csv" }, rows: 4, notes: [] });
    // the id as docs/reference/import.md works it out ("How a loaded file is named")
    expect(loads[0].source.id).toBe("tickets.csv#e51bd4bc21e98ee8");
    expect(loads[1].source.id).toBe(loads[0].source.id);
    // "restore" first, then the file's view through onViewChange, so a host can tell them apart
    const order = await page.evaluate(() => window.__order);
    expect(order.indexOf("data:restore")).toBeGreaterThan(-1);
    expect(order.slice(order.indexOf("data:restore") + 1)[0]).toBe("view");
    // the restored history has no step of its own ("change from outside") on top
    // the undo steps came along: the step on the file, then the load; Redo both again
    await page.getByTestId("undo").click();
    await expect.poll(() => chips(page, "rows")).toEqual([]);
    await page.getByTestId("undo").click();
    await expect.poll(() => fieldNames(page)).toEqual(before);
    await expect.poll(() => chips(page, "rows")).toEqual(hostChips);
    await expect(page.getByTestId("source-line")).toHaveCount(0);
    await page.getByTestId("redo").click();
    await expect.poll(() => fieldNames(page)).toEqual(TICKET_FIELDS);
    await page.getByTestId("redo").click();
    await expect.poll(() => chips(page, "rows")).toEqual(["Team"]);
    // twice in a row works the same
    await mountAgain(page, "host-remount");
    await expect.poll(() => chips(page, "rows")).toEqual(["Team"]);
    await expect(page.getByTestId("source-line")).toHaveText("tickets.csv, only in this browser");
    await page.getByTestId("undo").click();
    await expect.poll(() => chips(page, "rows")).toEqual([]);
    await page.getByTestId("undo").click();
    await expect.poll(() => fieldNames(page)).toEqual(before);
    await expect(page.getByTestId("undo")).toBeDisabled();
});
}

/** Loads tickets.csv into the report and puts Team into Rows; the table rows it shows then. */
async function ticketsWithTeam(page, scope = page) {
    await expect(scope.getByTestId("pivot-table")).toBeVisible();
    await dropFiles(page, scope.getByTestId("pivot-table"), [{ name: "tickets.csv", type: CSV, text: TICKETS }]);
    await scope.getByTestId("import-apply").click();
    await expect.poll(() => fieldNames(scope)).toEqual(TICKET_FIELDS);
    await drag(page, scope.locator('.pk-field[data-field="Team"]'), scope.locator('[data-zone="rows"]'));
    await expect.poll(() => chips(scope, "rows")).toEqual(["Team"]);
    return tableRows(scope);
}

// PowerShell Universal mounts the report twice within about 30 ms on Sync-UDElement (#135); "Mount
// twice" mounts it the second time before the report mounted the first time renders again
for (const [title, button] of [["in the same commit", "host-remount-twice"], ["30 ms apart", "host-remount-twice-30"]]) {
    for (const [host, query] of [["", ""], [", a host that passes the view back a moment later", "&asyncecho"]]) {
        test(`a host that mounts the report twice in a row (${title})${host}: the loaded file comes back with its view and its undo steps`, async ({ page }) => {
            await page.goto(`pages/host.html?import&remount${query}`);
            await expect(page.getByTestId("pivot-table")).toBeVisible();
            const before = await fieldNames(page);
            const table = await ticketsWithTeam(page);
            await mountAgain(page, button);
            await expect.poll(() => fieldNames(page)).toEqual(TICKET_FIELDS);
            await expect(page.getByTestId("source-line")).toHaveText("tickets.csv, only in this browser");
            await expect.poll(() => chips(page, "rows")).toEqual(["Team"]);
            expect(await tableRows(page)).toEqual(table);
            // both mounts restored the file
            await expect.poll(() => page.evaluate(() => window.__loads.map((l) => l.cause))).toEqual(["load", "restore", "restore"]);
            // the undo steps came along: the step on the file, then the load
            await page.getByTestId("undo").click();
            await expect.poll(() => chips(page, "rows")).toEqual([]);
            await page.getByTestId("undo").click();
            await expect.poll(() => fieldNames(page)).toEqual(before);
            await expect(page.getByTestId("undo")).toBeDisabled();
            await page.getByTestId("redo").click();
            await page.getByTestId("redo").click();
            await expect.poll(() => chips(page, "rows")).toEqual(["Team"]);
            // and once more
            await mountAgain(page, button);
            await expect.poll(() => chips(page, "rows")).toEqual(["Team"]);
            expect(await tableRows(page)).toEqual(table);
        });
    }
}

// a host whose view goes through its server shows its own view a moment longer than the report: a
// change made then is what the next mount brings back, not the host's view as a change from outside
for (const [host, query] of [["", ""], [", a host that passes the view back half a second later", "&asyncecho=500"]]) {
    test(`a file restored, changed at once and the report mounted again${host}: the change stays`, async ({ page }) => {
        await page.goto(`pages/host.html?import&remount${query}`);
        await ticketsWithTeam(page);
        await mountAgain(page, "host-remount");
        await expect.poll(() => chips(page, "rows")).toEqual(["Team"]);
        // Opened into Columns, and the host mounts the report again before it passed that view back
        await drag(page, page.locator('.pk-field[data-field="Opened"]'), page.locator('[data-zone="cols"]'));
        await mountAgain(page, "host-remount");
        await expect(page.getByTestId("source-line")).toHaveText("tickets.csv, only in this browser");
        await expect.poll(() => chips(page, "rows")).toEqual(["Team"]);
        await expect.poll(() => chips(page, "cols")).not.toEqual([]);
        const columns = await chips(page, "cols");
        expect(columns[0]).toMatch(/^Opened/);
        // the change is one step: Undo takes it back, the restored view before it
        await page.getByTestId("undo").click();
        await expect.poll(() => chips(page, "cols")).toEqual([]);
        await expect.poll(() => chips(page, "rows")).toEqual(["Team"]);
    });
}

test("a host that passes its own view again after a restore: the next mount shows that view, not the file's from before", async ({ page }) => {
    await page.goto("pages/host.html?import&remount");
    await ticketsWithTeam(page);
    await mountAgain(page, "host-remount");
    await expect.poll(() => chips(page, "rows")).toEqual(["Team"]);
    // the host's start view (made for its own data: nothing of it fits the file's columns)
    await page.getByTestId("host-start-view").click();
    await expect.poll(() => chips(page, "rows")).toEqual([]);
    await mountAgain(page, "host-remount");
    await expect(page.getByTestId("source-line")).toHaveText("tickets.csv, only in this browser");
    await expect.poll(() => chips(page, "rows")).toEqual([]);
    // the host's view was a step from outside: Undo goes back to the file's view
    await page.getByTestId("undo").click();
    await expect.poll(() => chips(page, "rows")).toEqual(["Team"]);
});

test("a host that mounts the report before its data is there keeps the file for the mount after", async ({ page }) => {
    await page.goto("pages/host.html?import&remount");
    await expect(page.getByTestId("pivot-table")).toBeVisible();
    const before = await fieldNames(page);
    await dropFiles(page, page.getByTestId("pivot-table"), [{ name: "tickets.csv", type: CSV, text: TICKETS }]);
    await page.getByTestId("import-apply").click();
    await expect.poll(() => fieldNames(page)).toEqual(TICKET_FIELDS);
    // mounted on no rows, the host's rows a moment later: the host's data, the file not dropped
    await mountAgain(page, "host-remount-empty");
    await expect.poll(() => fieldNames(page)).toEqual(before);
    await expect(page.getByTestId("source-line")).toHaveCount(0);
    await mountAgain(page, "host-remount");
    await expect.poll(() => fieldNames(page)).toEqual(TICKET_FIELDS);
    await expect(page.getByTestId("source-line")).toHaveText("tickets.csv, only in this browser");
});

test("what a report mounted again does not bring back: the host's data after Back to original data or Undo, other data from the host, a report without storageKey", async ({ page }) => {
    const load = async () => {
        await dropFiles(page, page.getByTestId("pivot-table"), [{ name: "tickets.csv", type: CSV, text: TICKETS }]);
        await page.getByTestId("import-apply").click();
        await expect.poll(() => fieldNames(page)).toEqual(TICKET_FIELDS);
    };
    await page.goto("pages/host.html?import&remount");
    await expect(page.getByTestId("pivot-table")).toBeVisible();
    const before = await fieldNames(page);
    // Back to original data: nothing of the file is kept
    await load();
    await dataMenu(page);
    await page.getByTestId("back-to-original").click();
    await expect(page.getByTestId("source-line")).toHaveCount(0);
    await mountAgain(page, "host-remount");
    await expect.poll(() => fieldNames(page)).toEqual(before);
    await expect(page.getByTestId("source-line")).toHaveCount(0);
    await expect(page.getByTestId("undo")).toBeDisabled();
    // Undo of the load: the same
    await load();
    await page.getByTestId("undo").click();
    await expect.poll(() => fieldNames(page)).toEqual(before);
    await mountAgain(page, "host-remount");
    await expect(page.getByTestId("source-line")).toHaveCount(0);
    await expect(page.getByTestId("undo")).toBeDisabled();
    // the host passes other data (another dataKey) when it mounts the report again: its data is shown,
    // and the file is let go: mounted again on the first data, the report shows that data
    await load();
    await mountAgain(page, "host-new-data");
    await expect.poll(() => fieldNames(page)).toEqual(before);
    await expect(page.getByTestId("source-line")).toHaveCount(0);
    await expect(page.getByTestId("undo")).toBeDisabled();
    await mountAgain(page, "host-new-data");
    await expect.poll(() => fieldNames(page)).toEqual(before);
    await expect(page.getByTestId("source-line")).toHaveCount(0);
    await expect(page.getByTestId("undo")).toBeDisabled();
    // without storageKey the report keeps nothing
    await page.goto("pages/host.html?import&remount&nokey");
    await expect(page.getByTestId("pivot-table")).toBeVisible();
    await load();
    await mountAgain(page, "host-remount");
    await expect.poll(() => fieldNames(page)).toEqual(before);
    await expect(page.getByTestId("source-line")).toHaveCount(0);
});

test("two reports on a page, each with its own storageKey: each gets its own file back", async ({ page }) => {
    await page.goto("pages/host.html?import&remount&two");
    const first = page.getByTestId("first");
    const second = page.getByTestId("second");
    await expect(first.getByTestId("pivot-table")).toBeVisible();
    await expect(second.getByTestId("pivot-table")).toBeVisible();
    const before = await fieldNames(second);
    await dropFiles(page, first.getByTestId("pivot-table"), [{ name: "tickets.csv", type: CSV, text: TICKETS }]);
    await first.getByTestId("import-apply").click();
    await expect.poll(() => fieldNames(first)).toEqual(TICKET_FIELDS);
    await mountAgain(page, "host-remount", second);
    await expect.poll(() => fieldNames(first)).toEqual(TICKET_FIELDS);
    await expect.poll(() => fieldNames(second)).toEqual(before);
    await expect(second.getByTestId("source-line")).toHaveCount(0);
    // the second report loads a file of its own
    const teams = JSON.stringify([{ Team: "A", Hours: 2 }, { Team: "B", Hours: 3 }]);
    await dropFiles(page, second.getByTestId("pivot-table"), [{ name: "teams.json", type: "application/json", text: teams }]);
    await second.getByTestId("import-apply").click();
    await expect.poll(() => fieldNames(second)).toEqual(["Team", "Hours"]);
    await mountAgain(page, "host-remount", second);
    await expect.poll(() => fieldNames(first)).toEqual(TICKET_FIELDS);
    await expect.poll(() => fieldNames(second)).toEqual(["Team", "Hours"]);
    await expect(first.getByTestId("source-line")).toHaveText("tickets.csv, only in this browser");
    await expect(second.getByTestId("source-line")).toHaveText("teams.json, only in this browser");
});

for (const [title, query] of [["", ""], [", its view controlled and started again by the page", "&controlled"]]) {
    strict(`the element taken out of the page and put back twice in a row (with storage-key)${title}: the loaded file comes back with its view and its undo steps`, async ({ page }) => {
        const report = await elementPage(page, `?key${query}`);
        await expect(report.getByTestId("pivot-table")).toBeVisible();
        const before = await fieldNames(report);
        const table = await ticketsWithTeam(page, report);
        await page.evaluate(() => window.__putBackTwice());
        await expect.poll(() => fieldNames(report)).toEqual(TICKET_FIELDS);
        await expect(report.getByTestId("source-line")).toHaveText("tickets.csv, only in this browser");
        await expect.poll(() => chips(report, "rows")).toEqual(["Team"]);
        expect(await tableRows(report)).toEqual(table);
        expect((await page.evaluate(() => window.__loads)).map((l) => l.cause)).toEqual(["load", "restore", "restore"]);
        await report.getByTestId("undo").click();
        await expect.poll(() => chips(report, "rows")).toEqual([]);
        await report.getByTestId("undo").click();
        await expect.poll(() => fieldNames(report)).toEqual(before);
    });
}

strict("the element taken out of the page and put back (with storage-key): the loaded file comes back with its view and its undo steps", async ({ page }) => {
    const report = await elementPage(page, "?key");
    await expect(report.getByTestId("pivot-table")).toBeVisible();
    const before = await fieldNames(report);
    await dropFiles(page, report.getByTestId("pivot-table"), [{ name: "tickets.csv", type: CSV, text: TICKETS }]);
    await report.getByTestId("import-apply").click();
    await expect.poll(() => fieldNames(report)).toEqual(TICKET_FIELDS);
    await drag(page, report.locator('.pk-field[data-field="Team"]'), report.locator('[data-zone="rows"]'));
    await expect.poll(() => chips(report, "rows")).toEqual(["Team"]);
    // out of the page long enough to unmount its React root, then back
    await page.evaluate(() => {
        window.__parked = document.getElementById("report");
        window.__parked.remove();
    });
    await expect.poll(() => page.evaluate(() => window.__parked.shadowRoot.querySelector(".pk-root") === null)).toBe(true);
    await page.evaluate(() => document.body.append(window.__parked));
    await expect.poll(() => fieldNames(report)).toEqual(TICKET_FIELDS);
    await expect.poll(() => chips(report, "rows")).toEqual(["Team"]);
    await expect(report.getByTestId("source-line")).toHaveText("tickets.csv, only in this browser");
    expect((await page.evaluate(() => window.__loads)).map((l) => l.cause)).toEqual(["load", "restore"]);
    await report.getByTestId("undo").click();
    await expect.poll(() => chips(report, "rows")).toEqual([]);
    await report.getByTestId("undo").click();
    await expect.poll(() => fieldNames(report)).toEqual(before);
});

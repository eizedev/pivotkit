// The page's own code: made-up rows from a fixed seed, the templates from the JSON block, the theme
// switch, and the report's events. No framework, no build step.

/** A small seeded random generator (mulberry32): the same rows on every load. */
function random(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function rows(n) {
    const rnd = random(11);
    const pick = (list) => list[Math.floor(rnd() * list.length)];
    const regions = { North: ["Norway", "Sweden"], Central: ["Germany", "Austria"], West: ["France", "Belgium"], South: ["Spain", "Italy"] };
    const products = [["Basic license", "Software", 120], ["Pro license", "Software", 480], ["Support plan", "Services", 900], ["Gateway", "Hardware", 650]];
    return Array.from({ length: n }, () => {
        const region = pick(Object.keys(regions));
        const [product, category, price] = pick(products);
        const units = 1 + Math.floor(rnd() * 12);
        return {
            Region: region,
            Country: pick(regions[region]),
            Product: product,
            Category: category,
            Month: new Date(Date.UTC(2025, Math.floor(rnd() * 18), 1)).toISOString().slice(0, 10),
            Units: units,
            Revenue: Math.round(units * price * (0.8 + rnd() * 0.2))
        };
    });
}

const report = document.querySelector("pivot-report");
const status = document.getElementById("last-event");
const saved = [];
const presets = JSON.parse(document.getElementById("templates").textContent);

report.data = rows(2000);
report.templates = presets;

report.addEventListener("pivot-view-change", (e) => {
    status.textContent = `View: rows ${e.detail.view.rows.join(", ") || "none"}; ${e.detail.view.values.length} value(s).`;
});
report.addEventListener("pivot-cell-click", (e) => {
    status.textContent = `Clicked ${e.detail.text ?? ""} (${e.detail.count} rows).`;
});
// a real page would send the view to its server; the report shows "Saved" when the promise resolves
report.addEventListener("pivot-template-save", (e) => {
    const { name, view } = e.detail;
    e.detail.respondWith(
        Promise.resolve().then(() => {
            saved.push({ name, view, deletable: true });
            report.templates = [...presets, ...saved];
        })
    );
});
report.addEventListener("pivot-template-delete", (e) => {
    const at = saved.findIndex((t) => t.name === e.detail.name);
    if (at >= 0) saved.splice(at, 1);
    report.templates = [...presets, ...saved];
});

// theme="auto" (the default) follows <html data-theme>: the page's switch themes the report too
const theme = document.getElementById("theme");
theme.addEventListener("change", () => {
    if (theme.value === "auto") {
        delete document.documentElement.dataset.theme;
    } else {
        document.documentElement.dataset.theme = theme.value;
    }
});

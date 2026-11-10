// The frame of a host page with a fixed navigation, as PowerShell Universal draws its apps (a MUI
// permanent drawer: position fixed, z-index 1200, 250 px wide; an app bar above it, z-index 1201),
// and the server inventory its report shows. Shared by nav.html (pivotkit-react) and
// element-nav.html (the web component). The report goes into the returned element, right of the
// drawer and under the app bar, as in the host.
//
// The data: one row per server, with a numeric `ID` (six digits from 109400, one per row: an identifier), host
// names of many lengths in `Name` (srv-app-frankfurt-prod-042.corp.example), and field names that
// are single words longer than a narrow field list ("Environment", "Manufacturer") or two words
// ("Date Commissioned"). The same rows on every run (a fixed seed).
import { random } from "../../../examples/playground/src/data.js";

export const DRAWER = 250;
export const APP_BAR = 64;

const CSS = `
html, body { margin: 0; font-family: system-ui, sans-serif; }
.host-appbar { position: fixed; top: 0; left: 0; right: 0; height: ${APP_BAR}px; z-index: 1201; background: #1976d2; color: #fff; display: flex; align-items: center; padding-left: ${DRAWER + 16}px; box-sizing: border-box; }
.host-drawer { position: fixed; top: 0; bottom: 0; left: 0; width: ${DRAWER}px; z-index: 1200; overflow-y: auto; background: #fff; border-right: 1px solid #ddd; box-sizing: border-box; padding: ${APP_BAR + 8}px 12px 12px; }
.host-drawer a { display: block; padding: 10px 8px; color: #222; text-decoration: none; }
.host-main { margin-left: ${DRAWER}px; padding: ${APP_BAR + 16}px 16px 16px; box-sizing: border-box; }
`;

/** Draws the app bar, the drawer and the main area; returns the main area. */
export function hostFrame(title) {
    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.append(style);
    const bar = document.createElement("header");
    bar.className = "host-appbar";
    bar.dataset.testid = "host-appbar";
    bar.textContent = title;
    const drawer = document.createElement("nav");
    drawer.className = "host-drawer";
    drawer.dataset.testid = "host-drawer";
    for (const name of ["Dashboard", "Servers", "Reports", "Settings"]) {
        const a = document.createElement("a");
        a.href = "#";
        a.textContent = name;
        drawer.append(a);
    }
    const main = document.createElement("main");
    main.className = "host-main";
    document.body.append(bar, drawer, main);
    return main;
}

const pick = (rnd, list) => list[Math.floor(rnd() * list.length)];

/** `n` servers: ID, Name, Environment, Manufacturer, Model, Date Commissioned, Location, Memory GB, Cost. */
export function servers(n = 10_000, seed = 31) {
    const rnd = random(seed);
    const roles = ["srv", "web", "db", "app", "k8s-node", "backup", "sql-cluster", "vdi", "ad"];
    const apps = ["app", "crm", "erp-finance", "sharepoint", "monitoring", "ci", "billing-gateway", "x"];
    const cities = ["frankfurt", "ffm", "muc", "berlin", "hamburg", "stuttgart-vaihingen", "koeln", "fra2"];
    const envs = ["Production", "Test", "Development", "Staging"];
    const short = { Production: "prod", Test: "test", Development: "dev", Staging: "stage" };
    const makers = { Dell: ["PowerEdge R650", "PowerEdge R750"], HPE: ["ProLiant DL380 Gen10", "ProLiant DL360"], Lenovo: ["ThinkSystem SR650"], VMware: ["Virtual Platform"] };
    const rows = new Array(n);
    for (let i = 0; i < n; i++) {
        const env = pick(rnd, envs);
        const maker = pick(rnd, Object.keys(makers));
        // a few short names among the long ones, so the rows on screen differ in width
        const name =
            rnd() < 0.15
                ? `${pick(rnd, roles)}-${String(i).padStart(4, "0")}`
                : `${pick(rnd, roles)}-${pick(rnd, apps)}-${pick(rnd, cities)}-${short[env]}-${String(i).padStart(4, "0")}${rnd() < 0.5 ? ".corp.example" : ""}`;
        rows[i] = {
            ID: 109_400 + i,
            Name: name,
            Environment: env,
            Manufacturer: maker,
            Model: pick(rnd, makers[maker]),
            "Date Commissioned": new Date(Date.UTC(2019, 0, 1) + Math.floor(rnd() * 2400) * 86_400_000).toISOString().slice(0, 10),
            Location: pick(rnd, ["Datacenter 1", "Datacenter 2", "Cloud"]),
            "Memory GB": pick(rnd, [16, 32, 64, 128, 256]),
            Cost: Math.round((800 + rnd() * 6000) * 100) / 100
        };
    }
    return rows;
}

/**
 * The start views of the page (`?view=`): "basic" (the default) a small table of environments,
 * "hosts" the host names by environment (#110), "ids" the IDs on Rows without a grand total, "wide" host names by environment and location (a
 * table larger than its area both ways, most of its cells empty), "broken" a view with parts the data
 * cannot use (a field it lacks, an unknown format), "none" an empty report.
 */
export const VIEWS = {
    basic: { rows: ["Environment"], values: [{ field: "Cost", agg: "sum" }] },
    hosts: { rows: ["Name"], cols: ["Environment"], values: [{ field: "Name", agg: "count" }] },
    ids: { rows: ["ID"], values: [{ field: "Cost", agg: "sum" }], totals: { grandTotalRow: false } },
    wide: { rows: ["Name"], cols: ["Environment", "Location"], values: [{ field: "Cost", agg: "sum" }] },
    broken: { rows: ["Environment", "Hostname"], values: [{ field: "Cost", agg: "sum", format: "money" }] },
    none: undefined
};

// Made-up data for the playground, generated from a fixed seed: the same rows on every machine and in
// every test run. Three data sets: IT tickets, sales, and assets per source system. No real names.

/** A small, fast seeded random generator (mulberry32). */
export function random(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Picks from [value, weight] pairs. */
function weighted(rnd, pairs) {
    const total = pairs.reduce((s, [, w]) => s + w, 0);
    let x = rnd() * total;
    for (const [v, w] of pairs) {
        x -= w;
        if (x < 0) return v;
    }
    return pairs[pairs.length - 1][0];
}

const pick = (rnd, list) => list[Math.floor(rnd() * list.length)];
const day = 86_400_000;
const START = Date.UTC(2025, 0, 1);
const SPAN_DAYS = 669; // to the end of October 2026
const iso = (ms) => new Date(ms).toISOString().slice(0, 16);
const isoDate = (ms) => new Date(ms).toISOString().slice(0, 10);
const round = (x, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

export function tickets(n, seed = 7) {
    const rnd = random(seed);
    const teams = [["Service Desk", 34], ["Workplace", 18], ["Network", 14], ["Server", 12], ["Database", 8], ["Security", 7], ["Applications", 7]];
    const prio = [["P1 Critical", 3], ["P2 High", 14], ["P3 Medium", 48], ["P4 Low", 35]];
    const baseHours = { "P1 Critical": 3, "P2 High": 10, "P3 Medium": 30, "P4 Low": 70 };
    const categories = ["Access", "Hardware", "Software", "Network", "Email", "Printing", "Account", "Request"];
    const channels = [["Portal", 46], ["Email", 28], ["Phone", 18], ["Chat", 8]];
    const rows = new Array(n);
    for (let i = 0; i < n; i++) {
        const priority = weighted(rnd, prio);
        const created = START + Math.floor(rnd() * SPAN_DAYS) * day + Math.floor(rnd() * 10 + 7) * 3_600_000;
        const lead = round(baseHours[priority] * Math.exp((rnd() + rnd() + rnd() - 1.5) * 0.9), 1);
        const age = (START + SPAN_DAYS * day - created) / day;
        const status = age < 3 ? weighted(rnd, [["Open", 5], ["In progress", 4], ["Waiting", 2]]) : age < 20 ? weighted(rnd, [["In progress", 2], ["Waiting", 1], ["Resolved", 4], ["Closed", 3]]) : weighted(rnd, [["Resolved", 2], ["Closed", 8]]);
        rows[i] = {
            Ticket: `INC-${String(100000 + i)}`,
            Team: weighted(rnd, teams),
            Priority: priority,
            Status: status,
            Category: pick(rnd, categories),
            Channel: weighted(rnd, channels),
            Created: iso(created),
            "Lead hours": status === "Open" ? null : lead,
            "SLA met": status === "Open" ? null : lead <= baseHours[priority] * 1.6,
            Reopened: rnd() < 0.06
        };
    }
    return rows;
}

export function sales(n, seed = 11) {
    const rnd = random(seed);
    const regions = {
        North: ["Norway", "Sweden", "Denmark"],
        Central: ["Germany", "Austria", "Switzerland"],
        West: ["France", "Belgium", "Netherlands"],
        South: ["Spain", "Italy", "Portugal"],
        East: ["Poland", "Czechia", "Hungary"]
    };
    const products = [
        ["Basic license", "Software", 120],
        ["Pro license", "Software", 480],
        ["Support plan", "Services", 900],
        ["Training day", "Services", 1400],
        ["Gateway", "Hardware", 650],
        ["Sensor kit", "Hardware", 85]
    ];
    const channels = [["Direct", 40], ["Partner", 45], ["Online", 15]];
    const rows = new Array(n);
    for (let i = 0; i < n; i++) {
        const region = weighted(rnd, [["Central", 32], ["West", 22], ["North", 16], ["South", 18], ["East", 12]]);
        const [product, category, price] = weighted(rnd, products.map((p, k) => [p, [26, 14, 10, 6, 12, 32][k]]));
        const month = Math.floor(rnd() * 22);
        const date = Date.UTC(2025, month, 1);
        const season = 1 + 0.25 * Math.sin(((month % 12) / 12) * Math.PI * 2 - 1.2);
        const units = Math.max(1, Math.round((product === "Sensor kit" ? 24 : 4) * season * (0.4 + rnd() * 1.4)));
        const discount = weighted(rnd, [[0, 55], [0.05, 25], [0.1, 15], [0.2, 5]]);
        rows[i] = {
            Region: region,
            Country: pick(rnd, regions[region]),
            Product: product,
            Category: category,
            Channel: weighted(rnd, channels),
            Month: isoDate(date),
            Units: units,
            Revenue: round(units * price * (1 - discount)),
            Discount: discount
        };
    }
    return rows;
}

export function assets(n, seed = 23) {
    const rnd = random(seed);
    const sources = [["CMDB", 30], ["Intune", 24], ["SCCM", 16], ["vCenter", 14], ["Azure", 9], ["AWS", 7]];
    const typesBySource = {
        CMDB: [["Server", 30], ["Network device", 20], ["Desktop", 25], ["Laptop", 25]],
        Intune: [["Laptop", 60], ["Mobile", 40]],
        SCCM: [["Desktop", 55], ["Laptop", 45]],
        vCenter: [["Virtual machine", 100]],
        Azure: [["Virtual machine", 70], ["Database", 30]],
        AWS: [["Virtual machine", 65], ["Database", 35]]
    };
    const osOf = { Server: ["Windows Server 2022", "Windows Server 2019", "Linux"], "Virtual machine": ["Windows Server 2022", "Linux", "Windows Server 2019"], Desktop: ["Windows 11", "Windows 10"], Laptop: ["Windows 11", "Windows 10", "macOS"], Mobile: ["iOS", "Android"], "Network device": ["Firmware"], Database: ["Managed"] };
    const costOf = { Server: 6200, "Virtual machine": 900, Desktop: 900, Laptop: 1400, Mobile: 650, "Network device": 2400, Database: 1800 };
    const locations = ["Site A", "Site B", "Site C", "Remote", "Datacenter 1", "Datacenter 2"];
    const rows = new Array(n);
    for (let i = 0; i < n; i++) {
        const source = weighted(rnd, sources);
        const type = weighted(rnd, typesBySource[source]);
        const purchased = Date.UTC(2019, 0, 1) + Math.floor(rnd() * 2850) * day;
        const status = weighted(rnd, [["Active", 82], ["In repair", 4], ["Retired", 14]]);
        rows[i] = {
            Asset: `AS-${String(500000 + i)}`,
            "Source system": source,
            Type: type,
            "Operating system": pick(rnd, osOf[type]),
            Location: source === "Azure" || source === "AWS" ? "Cloud" : type === "Virtual machine" || type === "Server" ? pick(rnd, ["Datacenter 1", "Datacenter 2"]) : pick(rnd, locations),
            Status: status,
            Purchased: isoDate(purchased),
            "Last seen": status === "Retired" ? null : isoDate(Date.UTC(2026, 9, 31) - Math.floor(rnd() * rnd() * 120) * day),
            Cost: round(costOf[type] * (0.7 + rnd() * 0.6)),
            "Disk GB": type === "Mobile" ? 128 : Math.round(weighted(rnd, [[256, 40], [512, 35], [1024, 20], [2048, 5]]))
        };
    }
    return rows;
}

/** The data sets of the playground with their start presets. */
export const DATASETS = {
    tickets: {
        make: tickets,
        // a duration is averaged, not summed, when it is added to Values
        fieldDefaults: { "Lead hours": { agg: "average", format: "duration:h" } },
        presets: [
            {
                name: "Tickets per team and priority",
                view: { rows: ["Team"], cols: ["Priority"], values: [{ field: "Ticket", agg: "count" }], sort: [{ field: "Team", by: "value", order: "desc" }] }
            },
            {
                name: "Median lead time by month",
                view: {
                    rows: ["Created (Year and month)"],
                    cols: ["Priority"],
                    derived: [{ name: "Created (Year and month)", field: "Created", by: "yearMonth" }],
                    values: [{ field: "Lead hours", agg: "median", format: "duration:h", conditional: { type: "colorScale", colors: ["#63be7b", "#ffeb84", "#f8696b"] } }],
                    filters: [{ field: "Status", type: "include", items: ["Resolved", "Closed"] }]
                }
            },
            {
                name: "Open work per team (chart)",
                view: {
                    rows: ["Team"],
                    cols: ["Status"],
                    values: [{ field: "Ticket", agg: "count" }],
                    filters: [{ field: "Status", type: "include", items: ["Open", "In progress", "Waiting"] }],
                    display: "chart",
                    chart: { type: "bar", stacked: true }
                }
            }
        ]
    },
    sales: {
        make: sales,
        presets: [
            {
                name: "Revenue by region and category",
                view: { rows: ["Region", "Country"], cols: ["Category"], values: [{ field: "Revenue", agg: "sum", format: "currency:EUR" }], sort: [{ field: "Region", by: "value", order: "desc" }] }
            },
            {
                name: "Monthly revenue trend (chart)",
                view: {
                    rows: ["Month (Year and month)"],
                    cols: ["Category"],
                    derived: [{ name: "Month (Year and month)", field: "Month", by: "yearMonth" }],
                    values: [{ field: "Revenue", agg: "sum", format: "currency:EUR" }],
                    display: "chart",
                    chart: { type: "line" }
                }
            },
            {
                name: "Top 3 products per region",
                view: {
                    rows: ["Region", "Product"],
                    values: [{ field: "Units", agg: "sum" }, { field: "Revenue", agg: "sum", format: "currency:EUR", conditional: { type: "dataBar" } }],
                    filters: [{ field: "Product", type: "top", count: 3, by: { field: "Revenue", agg: "sum" } }],
                    sort: [{ field: "Product", by: "value", order: "desc", value: { field: "Revenue", agg: "sum" } }]
                }
            }
        ]
    },
    assets: {
        make: assets,
        presets: [
            {
                name: "Assets per source system and type",
                view: { rows: ["Source system"], cols: ["Status"], values: [{ field: "Asset", agg: "count" }] }
            },
            {
                name: "Cost by type and location",
                view: { rows: ["Type", "Location"], values: [{ field: "Cost", agg: "sum", format: "currency:EUR" }, { field: "Cost", agg: "average", format: "currency:EUR" }], filters: [{ field: "Status", type: "exclude", items: ["Retired"] }] }
            },
            {
                name: "Purchases per year (chart)",
                view: {
                    rows: ["Purchased (Year)"],
                    cols: ["Source system"],
                    derived: [{ name: "Purchased (Year)", field: "Purchased", by: "year" }],
                    values: [{ field: "Asset", agg: "count" }],
                    display: "chart",
                    chart: { type: "bar", stacked: true }
                }
            }
        ]
    },
    // not in the page's menu (?data=markup): labels that look like HTML, for the browser test that
    // nothing from the data is rendered as markup
    markup: {
        make: (n) => Array.from({ length: Math.min(n, 60) }, (_, i) => ({ Label: i % 2 ? "<img src=x onerror=window.__pwned=1>" : `<b>bold ${i % 3}</b>`, Value: i })),
        presets: [{ name: "Markup", view: { rows: ["Label"], values: [{ field: "Value", agg: "sum" }] } }]
    }
};

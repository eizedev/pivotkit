// The data sets of the playground. Five are real public data, read from the snapshots in ../data/
// (fetched once by `npm run docs:data`, see ../data/SOURCES.md): daily weather, countries, earthquakes,
// Nobel laureates and software end of life, each with templates phrased as the questions they answer. Three are made up,
// generated from a fixed seed (the same rows on every machine and in every test run) in any size for
// the tests and the benchmarks: IT tickets, sales, and assets per source system. No real names.
import { unpack } from "../data/sources.js";

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
            // a numeric identifier: shown as it is in the drill-down (fieldDefaults drillFormat "text")
            "Inventory number": 40000 + i,
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

/**
 * The real data sets: `load()` reads the snapshot (its own chunk, loaded when it is picked), `source`
 * is the attribution the page shows next to the data, as the licences ask.
 */
export const REAL = {
    weather: {
        label: "Weather of 14 cities, 2023-2025",
        load: () => import("../data/weather.json").then((m) => unpack(m.default)),
        source: {
            text: "Weather data by Open-Meteo.com",
            href: "https://open-meteo.com/",
            licence: "CC BY 4.0",
            licenceHref: "https://creativecommons.org/licenses/by/4.0/",
            // Open-Meteo's "best match" combines ECMWF IFS, ERA5 and ERA5-Land; the Copernicus Climate
            // Data Store asks for this attribution of ERA5 and ERA5-Land (see ../data/SOURCES.md)
            credit: "Contains modified Copernicus Climate Change Service information 2023 (ERA5) and 2019 (ERA5-Land), and ECMWF IFS data. Neither the European Commission nor ECMWF is responsible for any use that may be made of the Copernicus information or data it contains."
        },
        // temperatures and sunshine are averaged when they are added to Values; rain days add up
        fieldDefaults: {
            "Max °C": { agg: "average", format: "number:1" },
            "Min °C": { agg: "average", format: "number:1" },
            "Mean °C": { agg: "average", format: "number:1" },
            "Sunshine h": { agg: "average", format: "number:1" },
            "Rain mm": { agg: "sum", format: "number:0" },
            "Rain day": { agg: "sum" },
            // the seasons in the order of the year, offered as "Custom order" in the field's menu
            Season: { order: ["Spring", "Summer", "Autumn", "Winter"] }
        },
        presets: [
            {
                name: "How warm is each city, month by month?",
                view: {
                    rows: ["City"],
                    cols: ["Date (Month)"],
                    derived: [{ name: "Date (Month)", field: "Date", by: "month" }],
                    values: [{ field: "Mean °C", agg: "average", format: "number:1", conditional: { type: "colorScale", colors: ["#5a8dee", "#f4f4f4", "#e8554e"] } }],
                    totals: { grandTotalRow: false }
                }
            },
            {
                name: "Which city is the sunniest? (top 3)",
                view: {
                    rows: ["City"],
                    values: [{ field: "Sunshine h", agg: "average", format: "number:1", label: "Sunshine hours per day" }],
                    filters: [{ field: "City", type: "top", count: 3, by: { field: "Sunshine h", agg: "average" } }],
                    sort: [{ field: "City", by: "value", order: "desc" }]
                }
            },
            {
                name: "How many rain days per season? (2025)",
                view: {
                    rows: ["City"],
                    cols: ["Season"],
                    derived: [{ name: "Year", field: "Date", by: "year" }],
                    values: [{ field: "Rain day", agg: "sum", label: "Rain days", conditional: { type: "dataBar" } }],
                    filters: [{ field: "Year", type: "include", items: [2025] }],
                    sort: [{ field: "City", by: "value", order: "desc" }]
                }
            },
            {
                name: "Was 2025 warmer than 2023 in Berlin? (chart)",
                view: {
                    rows: ["Date (Month)"],
                    cols: ["Date (Year)"],
                    derived: [{ name: "Date (Month)", field: "Date", by: "month" }, { name: "Date (Year)", field: "Date", by: "year" }],
                    values: [{ field: "Mean °C", agg: "average", format: "number:1" }],
                    filters: [{ field: "City", type: "include", items: ["Berlin"] }],
                    display: "chart",
                    chart: { type: "line" }
                }
            }
        ]
    },
    countries: {
        label: "Countries: population, GDP, CO2, 2005-2024",
        load: () => import("../data/countries.json").then((m) => unpack(m.default)),
        source: { text: "World Bank, World Development Indicators", href: "https://data.worldbank.org/", licence: "CC BY 4.0", licenceHref: "https://creativecommons.org/licenses/by/4.0/" },
        fieldDefaults: {
            Population: { format: "integer" },
            "GDP (US$)": { format: "compact" },
            "CO2 (Mt)": { format: "number:0" },
            Year: { drillFormat: "text" }
        },
        presets: [
            {
                name: "Where do most people live? Region, then country (2024)",
                view: {
                    rows: ["Region", "Country"],
                    values: [{ field: "Population", agg: "sum", format: "compact" }],
                    filters: [{ field: "Year", type: "include", items: [2024] }, { field: "Country", type: "top", count: 3, by: { field: "Population", agg: "sum" } }],
                    sort: [{ field: "Region", by: "value", order: "desc" }, { field: "Country", by: "value", order: "desc" }]
                }
            },
            {
                name: "What share of the world's CO2 comes from each region?",
                view: {
                    rows: ["Region"],
                    cols: ["Year"],
                    values: [{ field: "CO2 (Mt)", agg: "sum", label: "Share of CO2", showAs: { type: "percentOfColumnTotal" } }],
                    filters: [{ field: "Year", type: "include", items: [2005, 2010, 2015, 2020, 2024] }],
                    sort: [{ field: "Region", by: "value", order: "desc" }]
                }
            },
            {
                name: "How much did GDP change from the year before?",
                view: {
                    rows: ["Income group"],
                    cols: ["Year"],
                    values: [{ field: "GDP (US$)", agg: "sum", label: "GDP change", showAs: { type: "percentDifferenceFromPrevious", axis: "cols" } }],
                    filters: [{ field: "Year", type: "include", items: [2019, 2020, 2021, 2022, 2023, 2024] }],
                    totals: { grandTotalColumn: false }
                }
            },
            {
                name: "How has population grown per income group? (chart)",
                view: {
                    rows: ["Year"],
                    cols: ["Income group"],
                    values: [{ field: "Population", agg: "sum", format: "compact" }],
                    display: "chart",
                    chart: { type: "bar", stacked: true }
                }
            }
        ]
    },
    earthquakes: {
        label: "Earthquakes of magnitude 4.5+, 2025",
        load: () => import("../data/earthquakes.json").then((m) => unpack(m.default)),
        source: { text: "U.S. Geological Survey, ANSS Comprehensive Catalog", href: "https://earthquake.usgs.gov/earthquakes/search/", licence: "public domain", licenceHref: "https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits" },
        fieldDefaults: {
            Magnitude: { agg: "max", format: "number:1" },
            "Depth km": { agg: "average", format: "number:0" }
        },
        presets: [
            {
                name: "How strong were the quakes? (magnitude ranges)",
                view: {
                    rows: ["Magnitude (by 0.5)"],
                    derived: [{ name: "Magnitude (by 0.5)", field: "Magnitude", by: "bin", size: 0.5, origin: 4.5 }],
                    values: [{ field: "Time", agg: "count", label: "Quakes" }, { field: "Time", agg: "count", label: "Share", showAs: { type: "percentOfGrandTotal" } }]
                }
            },
            {
                name: "Which regions shook most often? (top 10)",
                view: {
                    rows: ["Region"],
                    values: [{ field: "Time", agg: "count", label: "Quakes", conditional: { type: "dataBar" } }, { field: "Magnitude", agg: "max", format: "number:1" }],
                    filters: [{ field: "Region", type: "top", count: 10, by: { field: "Time", agg: "count" } }],
                    sort: [{ field: "Region", by: "value", order: "desc" }]
                }
            },
            {
                name: "Where were the quakes of 7 and more? Click a count for the quakes",
                view: {
                    rows: ["Region"],
                    cols: ["Tsunami flag"],
                    values: [{ field: "Time", agg: "count", label: "Quakes" }],
                    filters: [{ field: "Magnitude (by 1)", type: "include", items: [7, 8] }],
                    derived: [{ name: "Magnitude (by 1)", field: "Magnitude", by: "bin", size: 1, origin: 0 }],
                    sort: [{ field: "Region", by: "value", order: "desc" }]
                }
            },
            {
                name: "Did some months shake more than others? (chart)",
                view: {
                    rows: ["Time (Month)"],
                    derived: [{ name: "Time (Month)", field: "Time", by: "yearMonth" }],
                    values: [{ field: "Time", agg: "count", label: "Quakes" }],
                    display: "chart",
                    chart: { type: "bar" }
                }
            }
        ]
    },
    nobel: {
        label: "Nobel Prize laureates, 1901-2026",
        load: () => import("../data/nobel.json").then((m) => unpack(m.default)),
        source: { text: "Nobel Prize Outreach, api.nobelprize.org", href: "https://www.nobelprize.org/about/developer-zone-2/", licence: "CC0", licenceHref: "https://creativecommons.org/publicdomain/zero/1.0/" },
        fieldDefaults: { Year: { drillFormat: "text" }, "Age at award": { agg: "average", format: "number:0" } },
        presets: [
            {
                name: "How many laureates per category and decade?",
                view: {
                    rows: ["Category"],
                    cols: ["Year (by 10)"],
                    derived: [{ name: "Year (by 10)", field: "Year", by: "bin", size: 10, origin: 1900 }],
                    values: [{ field: "Laureate", agg: "count", label: "Laureates" }]
                }
            },
            {
                name: "The same, decades down: swap rows and columns (chart)",
                view: {
                    rows: ["Year (by 10)"],
                    cols: ["Category"],
                    derived: [{ name: "Year (by 10)", field: "Year", by: "bin", size: 10, origin: 1900 }],
                    values: [{ field: "Laureate", agg: "count", label: "Laureates" }],
                    display: "chart",
                    chart: { type: "bar", stacked: true }
                }
            },
            {
                name: "What share of laureates are women, per category?",
                view: {
                    rows: ["Category"],
                    cols: ["Gender"],
                    values: [{ field: "Laureate", agg: "count", label: "Laureates", showAs: { type: "percentOfRowTotal" } }],
                    filters: [{ field: "Type", type: "include", items: ["Person"] }],
                    sort: [{ field: "Category", by: "label", order: "asc" }]
                }
            },
            {
                name: "Which countries have the most laureates? (top 10)",
                view: {
                    rows: ["Country"],
                    values: [{ field: "Laureate", agg: "count", label: "Laureates" }, { field: "Age at award", agg: "average", format: "number:0" }],
                    filters: [{ field: "Country", type: "top", count: 10, by: { field: "Laureate", agg: "count" } }],
                    sort: [{ field: "Country", by: "value", order: "desc" }]
                }
            }
        ]
    },
    endoflife: {
        label: "Software end of life, 489 products",
        load: () => import("../data/endoflife.json").then((m) => unpack(m.default)),
        source: {
            text: "endoflife.date",
            href: "https://endoflife.date/",
            licence: "MIT",
            licenceHref: "https://github.com/endoflife-date/endoflife.date/blob/master/LICENSE",
            // the MIT License asks for its copyright notice with every copy of the data
            credit: "Copyright 2020 endoflife.date contributors."
        },
        fieldDefaults: {
            "Support years": { agg: "average", format: "number:1" },
            "Days to EOL": { agg: "min", format: "integer" },
            "Release year": { drillFormat: "text" }
        },
        presets: [
            {
                name: "How many release cycles reach end of life per year? (chart)",
                view: {
                    rows: ["EOL date (Year)"],
                    derived: [{ name: "EOL date (Year)", field: "EOL date", by: "year" }],
                    values: [{ field: "Cycle", agg: "count", label: "Release cycles" }],
                    filters: [{ field: "EOL date (Year)", type: "include", items: [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030] }],
                    display: "chart",
                    chart: { type: "bar" }
                }
            },
            {
                name: "Which products have the most supported release cycles right now? (top 10)",
                view: {
                    rows: ["Product"],
                    values: [{ field: "Cycle", agg: "count", label: "Supported cycles", conditional: { type: "dataBar" } }, { field: "Released", agg: "min", label: "Oldest supported" }],
                    filters: [{ field: "Maintained", type: "include", items: [true] }, { field: "Product", type: "top", count: 10, by: { field: "Cycle", agg: "count" } }],
                    sort: [{ field: "Product", by: "value", order: "desc" }]
                }
            },
            {
                name: "How long is a release supported, by category? (ranges of 2 years)",
                view: {
                    rows: ["Category"],
                    cols: ["Support years (by 2)"],
                    derived: [{ name: "Support years (by 2)", field: "Support years", by: "bin", size: 2, origin: 0 }],
                    values: [{ field: "Cycle", agg: "count", label: "Release cycles", showAs: { type: "percentOfRowTotal" }, conditional: { type: "colorScale", colors: ["#f4f4f4", "#5a8dee"] } }],
                    // a cycle without a known end of life has no support length
                    filters: [{ field: "Support years (by 2)", type: "exclude", items: [null] }],
                    sort: [{ field: "Category", by: "label", order: "asc" }]
                }
            },
            {
                name: "Are LTS releases supported longer? (average years)",
                view: {
                    rows: ["Category"],
                    cols: ["LTS"],
                    values: [{ field: "Support years", agg: "average", format: "number:1" }],
                    sort: [{ field: "Category", by: "value", order: "desc" }]
                }
            },
            {
                name: "What reaches end of life in the next 12 months? Click a count for the cycles",
                view: {
                    rows: ["Category", "Product"],
                    cols: ["EOL date (Quarter)"],
                    derived: [{ name: "EOL date (Quarter)", field: "EOL date", by: "yearQuarter" }, { name: "Days to EOL (by 365)", field: "Days to EOL", by: "bin", size: 365, origin: 0 }],
                    values: [{ field: "Cycle", agg: "count", label: "Release cycles" }],
                    filters: [{ field: "Days to EOL (by 365)", type: "include", items: [0] }],
                    sort: [{ field: "Category", by: "value", order: "desc" }, { field: "Product", by: "value", order: "desc" }]
                }
            }
        ]
    }
};

/** The data sets of the playground with their start presets. */
export const DATASETS = {
    ...REAL,
    tickets: {
        label: "IT tickets",
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
        label: "Sales",
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
        label: "Assets per source system",
        make: assets,
        fieldDefaults: { "Inventory number": { drillFormat: "text" }, Cost: { format: "currency:EUR" } },
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

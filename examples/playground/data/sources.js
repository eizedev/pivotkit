// The five real data sets of the playground: where each comes from, the request that fetched its
// snapshot, and how the response becomes the array of plain objects (one per row) that pivotkit takes.
// `npm run docs:data` (scripts/docs-data.js) runs these requests once and writes the snapshots next to
// this file; the playground and its browser tests read the snapshots, never the APIs. The "Learn with
// real data" page of the documentation site shows the marked sections of this file, so the mapping
// that made the snapshot is the one people copy to query the source live.
//
// Plain JavaScript without imports: it runs in Node (the script, the tests) and in a browser.

/** Sent as User-Agent by scripts/docs-data.js: generic, no contact details. */
export const USER_AGENT = "pivotkit-docs-data";

// --8<-- [start:weather]
/** Daily weather of 14 cities, 2023 to 2025 (Open-Meteo Historical Weather API, ERA5 and others). */
export const WEATHER = {
    start: "2023-01-01",
    end: "2025-12-31",
    cities: [
        { city: "Reykjavik", country: "Iceland", continent: "Europe", latitude: 64.15, longitude: -21.94 },
        { city: "London", country: "United Kingdom", continent: "Europe", latitude: 51.51, longitude: -0.13 },
        { city: "Berlin", country: "Germany", continent: "Europe", latitude: 52.52, longitude: 13.41 },
        { city: "Rome", country: "Italy", continent: "Europe", latitude: 41.89, longitude: 12.48 },
        { city: "Cairo", country: "Egypt", continent: "Africa", latitude: 30.04, longitude: 31.24 },
        { city: "Cape Town", country: "South Africa", continent: "Africa", latitude: -33.92, longitude: 18.42 },
        { city: "Dubai", country: "United Arab Emirates", continent: "Asia", latitude: 25.2, longitude: 55.27 },
        { city: "Mumbai", country: "India", continent: "Asia", latitude: 19.08, longitude: 72.88 },
        { city: "Singapore", country: "Singapore", continent: "Asia", latitude: 1.35, longitude: 103.82 },
        { city: "Tokyo", country: "Japan", continent: "Asia", latitude: 35.68, longitude: 139.69 },
        { city: "Sydney", country: "Australia", continent: "Oceania", latitude: -33.87, longitude: 151.21 },
        { city: "New York", country: "United States", continent: "North America", latitude: 40.71, longitude: -74.01 },
        { city: "Mexico City", country: "Mexico", continent: "North America", latitude: 19.43, longitude: -99.13 },
        { city: "São Paulo", country: "Brazil", continent: "South America", latitude: -23.55, longitude: -46.63 }
    ]
};

/** The request for one city: daily values in the city's own time zone. No key needed. */
export function weatherUrl({ latitude, longitude }, start = WEATHER.start, end = WEATHER.end) {
    const q = new URLSearchParams({
        latitude: String(latitude),
        longitude: String(longitude),
        start_date: start,
        end_date: end,
        daily: "temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,sunshine_duration",
        timezone: "auto"
    });
    return `https://archive-api.open-meteo.com/v1/archive?${q}`;
}

const SEASONS = ["Winter", "Winter", "Spring", "Spring", "Spring", "Summer", "Summer", "Summer", "Autumn", "Autumn", "Autumn", "Winter"];

/** Meteorological season of a month (1-12); south of the equator the seasons are swapped. */
export function season(month, latitude) {
    return SEASONS[latitude < 0 ? (month + 5) % 12 : month - 1];
}

/** One row per city and day from the response of `weatherUrl(city)`. */
export function weatherRows(city, response) {
    const d = response.daily;
    return d.time.map((date, i) => ({
        City: city.city,
        Country: city.country,
        Continent: city.continent,
        Date: date,
        Season: season(Number(date.slice(5, 7)), city.latitude),
        "Max °C": d.temperature_2m_max[i],
        "Min °C": d.temperature_2m_min[i],
        "Mean °C": d.temperature_2m_mean[i],
        "Rain mm": d.precipitation_sum[i],
        // 1 on a day with at least 1 mm: its sum counts the rain days, its average is their share
        "Rain day": d.precipitation_sum[i] === null ? null : d.precipitation_sum[i] >= 1 ? 1 : 0,
        // the API gives seconds
        "Sunshine h": d.sunshine_duration[i] === null ? null : Math.round(d.sunshine_duration[i] / 360) / 10
    }));
}
// --8<-- [end:weather]

// --8<-- [start:countries]
/** Population, GDP and CO2 per country and year (World Bank, World Development Indicators). */
export const COUNTRIES = {
    years: "2005:2024",
    indicators: {
        Population: "SP.POP.TOTL",
        "GDP (US$)": "NY.GDP.MKTP.CD",
        "CO2 (Mt)": "EN.GHG.CO2.MT.CE.AR5"
    }
};

/** The country list with region and income group; aggregates such as "World" have the region "Aggregates". */
export const countriesUrl = "https://api.worldbank.org/v2/country?format=json&per_page=400";

/** One indicator for every country and year in one page. No key needed. */
export function indicatorUrl(indicator, years = COUNTRIES.years) {
    return `https://api.worldbank.org/v2/country/all/indicator/${indicator}?format=json&date=${years}&per_page=20000`;
}

/**
 * One row per country and year. `countries` is the response of `countriesUrl`, `indicators` maps each
 * field name of COUNTRIES.indicators to the response of its `indicatorUrl`. A response is
 * `[paging, records]`.
 */
export function countryRows(countries, indicators) {
    const meta = new Map();
    for (const c of countries[1]) {
        // aggregates (World, Euro area, income groups) would count every country twice
        // (the API ends a few region names with a space)
        if (c.region.value !== "Aggregates") meta.set(c.id, { name: c.name.trim(), region: c.region.value.trim(), income: c.incomeLevel.value.trim() });
    }
    const rows = new Map();
    for (const [field, response] of Object.entries(indicators)) {
        for (const r of response[1] ?? []) {
            const m = meta.get(r.countryiso3code);
            if (!m) continue;
            const key = `${r.countryiso3code}:${r.date}`;
            if (!rows.has(key)) {
                const row = { Country: m.name, Code: r.countryiso3code, Region: m.region, "Income group": m.income, Year: Number(r.date) };
                for (const f of Object.keys(indicators)) row[f] = null;
                rows.set(key, row);
            }
            // GDP to whole dollars: the cents of a country's GDP are noise
            rows.get(key)[field] = r.value === null ? null : field === "GDP (US$)" ? Math.round(r.value) : r.value;
        }
    }
    return [...rows.values()].sort((a, b) => a.Country.localeCompare(b.Country, "en") || a.Year - b.Year);
}
// --8<-- [end:countries]

// --8<-- [start:earthquakes]
/** Every earthquake of magnitude 4.5 or more in 2025 (USGS ANSS Comprehensive Catalog). */
export const EARTHQUAKES = { start: "2025-01-01", end: "2026-01-01", minMagnitude: 4.5 };

/** The FDSN event query as GeoJSON; it returns at most 20,000 events per request. No key needed. */
export function earthquakesUrl({ start, end, minMagnitude } = EARTHQUAKES) {
    const q = new URLSearchParams({ format: "geojson", starttime: start, endtime: end, minmagnitude: String(minMagnitude), eventtype: "earthquake", orderby: "time-asc" });
    return `https://earthquake.usgs.gov/fdsnws/event/1/query?${q}`;
}

/**
 * The region of a USGS place name: the text after the last comma ("92 km S of Lakatoro, Vanuatu" is
 * "Vanuatu"), else all of it ("southern Mid-Atlantic Ridge"). A named event ("2025 Mandalay, Burma
 * (Myanmar) Earthquake") loses its year and "Earthquake".
 */
export function quakeRegion(place) {
    if (!place) return null;
    const i = place.lastIndexOf(",");
    return (i < 0 ? place : place.slice(i + 1)).replace(/^\s*\d{4}\s+/, "").replace(/\s+Earthquake\s*$/i, "").trim();
}

/** One row per earthquake from the response of `earthquakesUrl()`. */
export function earthquakeRows(response) {
    return response.features.map((f) => ({
        // an instant in UTC, to the second
        Time: new Date(f.properties.time).toISOString().slice(0, 19) + "Z",
        Magnitude: f.properties.mag,
        "Depth km": Math.round(f.geometry.coordinates[2] * 10) / 10,
        Place: f.properties.place,
        Region: quakeRegion(f.properties.place),
        Latitude: Math.round(f.geometry.coordinates[1] * 100) / 100,
        Longitude: Math.round(f.geometry.coordinates[0] * 100) / 100,
        // green, yellow, orange or red when USGS's PAGER estimated the impact, else blank
        Alert: f.properties.alert,
        // USGS sets it for large events in oceanic regions; it does not say that a tsunami happened
        "Tsunami flag": f.properties.tsunami === 1 ? "Yes" : "No"
    }));
}
// --8<-- [end:earthquakes]

// --8<-- [start:nobel]
/** Every Nobel Prize laureate, persons and organizations, to the prizes of 2026 (Nobel Prize API 2.1). */
export const NOBEL = { pageSize: 1000 };

/** One page of laureates; the response's `meta.count` tells how many there are. No key needed. */
export function nobelUrl(offset = 0, limit = NOBEL.pageSize) {
    return `https://api.nobelprize.org/2.1/laureates?offset=${offset}&limit=${limit}&sort=asc`;
}

/** One row per prize of a laureate (a few laureates won twice) from the `laureates` of every page. */
export function nobelRows(laureates) {
    const rows = [];
    for (const l of laureates) {
        const person = Boolean(l.knownName);
        const name = person ? l.knownName.en : l.orgName.en;
        const born = person ? l.birth?.year : l.founded?.date?.slice(0, 4);
        const country = person ? l.birth?.place?.countryNow?.en : l.founded?.place?.countryNow?.en;
        for (const p of l.nobelPrizes ?? []) {
            const [num, den] = String(p.portion ?? "1").split("/").map(Number);
            rows.push({
                Laureate: name,
                Type: person ? "Person" : "Organization",
                Gender: person && l.gender ? l.gender[0].toUpperCase() + l.gender.slice(1) : null,
                Category: p.category.en,
                Year: Number(p.awardYear),
                // a prize shared by three is 1/3 each; the shares of one prize add up to 1
                Share: num / (den || 1),
                "Age at award": person && born ? Number(p.awardYear) - Number(born) : null,
                // where a person was born or an organization founded, in today's borders
                Country: country ?? null
            });
        }
    }
    return rows.sort((a, b) => a.Year - b.Year || a.Category.localeCompare(b.Category, "en") || a.Laureate.localeCompare(b.Laureate, "en"));
}
// --8<-- [end:nobel]

// --8<-- [start:endoflife]
/** Every release cycle of every product on endoflife.date: release, support and end-of-life dates. */
export const ENDOFLIFE = {
    // the API's category slugs as labels; a category added later keeps its slug
    categories: {
        app: "App",
        database: "Database",
        device: "Device",
        framework: "Framework",
        lang: "Language",
        os: "Operating system",
        "server-app": "Server app",
        service: "Service",
        standard: "Standard"
    }
};

/** All products with all their release cycles in one response (about 3 MB). No key needed. */
export const endoflifeUrl = "https://endoflife.date/api/v1/products/full";

/** Whole days from the date `from` to the date `to` ("YYYY-MM-DD", read as UTC: no time zone shift). */
export function daysBetween(from, to) {
    return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

/**
 * One row per release cycle from the response of `endoflifeUrl`. The API decides "EOL" and
 * "Maintained" on the day it generated the response (`generated_at`); "Days to EOL" counts from that
 * day too, so the three agree. A date the API does not know is null, never a boolean.
 */
export function endoflifeRows(response) {
    const asOf = response.generated_at.slice(0, 10);
    const rows = [];
    for (const p of response.result) {
        for (const r of p.releases) {
            // eolFrom is a date or null (not known); isEol is always a boolean
            const eol = r.eolFrom ?? null;
            rows.push({
                Product: p.label,
                Category: ENDOFLIFE.categories[p.category] ?? p.category,
                Cycle: r.name,
                Released: r.releaseDate,
                "EOL date": eol,
                EOL: r.isEol,
                // any support left, extended support included
                Maintained: r.isMaintained,
                LTS: r.isLts,
                // the end of active support: not provided for products without that phase, null when unknown
                "Active support until": r.eoasFrom ?? null,
                // from the release to its end of life in years of 365.25 days (1,461 days are 4 years), cut, not
                // rounded, to 0.01 so that a range of whole years holds exactly its cycles; blank without an end
                "Support years": eol === null ? null : Math.floor((daysBetween(r.releaseDate, eol) * 400) / 1461) / 100,
                // negative: the end of life lies that many days back
                "Days to EOL": eol === null ? null : daysBetween(asOf, eol),
                "Latest version": r.latest?.name ?? null,
                "Latest release": r.latest?.date ?? null,
                "Release year": Number(r.releaseDate.slice(0, 4)),
                // last: long, and only useful to search or filter by
                Tags: p.tags.length ? p.tags.join(", ") : null
            });
        }
    }
    return rows.sort((a, b) => a.Product.localeCompare(b.Product, "en") || b.Released.localeCompare(a.Released) || a.Cycle.localeCompare(b.Cycle, "en"));
}
// --8<-- [end:endoflife]

/**
 * A snapshot on disk is `{ columns, dicts, rows }`: each row an array in the order of `columns`, and a
 * text column with few distinct values (a city, a region) stored as an index into its list in `dicts`.
 * That keeps the snapshots at about a third of an array of objects. `unpack` turns it back into what
 * pivotkit takes.
 */
export function pack(rows) {
    const columns = Object.keys(rows[0] ?? {});
    const dicts = {};
    for (const c of columns) {
        const values = new Set(rows.map((r) => r[c]));
        if ([...values].every((v) => v === null || v === undefined || typeof v === "string") && values.size <= Math.max(16, rows.length / 8)) {
            dicts[c] = [...values].filter((v) => typeof v === "string").sort((a, b) => a.localeCompare(b, "en"));
        }
    }
    const index = Object.fromEntries(Object.entries(dicts).map(([c, list]) => [c, new Map(list.map((v, i) => [v, i]))]));
    return { columns, dicts, rows: rows.map((r) => columns.map((c) => (r[c] === null || r[c] === undefined ? null : index[c] ? index[c].get(r[c]) : r[c]))) };
}

/** The rows of a packed snapshot as plain objects. */
export function unpack({ columns, dicts = {}, rows }) {
    const lists = columns.map((c) => (Object.hasOwn(dicts, c) ? dicts[c] : null));
    return rows.map((r) => {
        const row = {};
        for (let i = 0; i < columns.length; i++) row[columns[i]] = r[i] === null || !lists[i] ? r[i] : lists[i][r[i]];
        return row;
    });
}

// Fetches the four real data sets of the playground once and writes their snapshots to
// examples/playground/data/ (weather.json, countries.json, earthquakes.json, nobel.json), committed
// with the repository. The requests and the mapping from response to rows are in
// examples/playground/data/sources.js; this file only runs them, slowly, and writes the result.
//
//   npm run docs:data              all four
//   npm run docs:data -- weather   one or more by name
//
// The snapshots are data, not code: the playground and the browser tests read them and never call
// the APIs. Sources, licences and attribution are in examples/playground/data/SOURCES.md.
import { writeFile } from "node:fs/promises";
import {
    COUNTRIES, USER_AGENT, WEATHER, countriesUrl, countryRows, earthquakeRows, earthquakesUrl, indicatorUrl,
    nobelRows, nobelUrl, pack, weatherRows, weatherUrl
} from "../examples/playground/data/sources.js";

const out = new URL("../examples/playground/data/", import.meta.url);
const later = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function get(url) {
    for (let attempt = 1; ; attempt++) {
        let response;
        try {
            response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
        } catch (error) {
            // a connection that timed out: try again, three times at most
            if (attempt >= 3) throw error;
            await later(10_000 * attempt);
            continue;
        }
        if (response.ok) return response.json();
        // 429 or a passing 5xx: wait and try again, three times at most
        if (attempt >= 3 || (response.status !== 429 && response.status < 500)) throw new Error(`${response.status} ${response.statusText}: ${url}`);
        await later(30_000 * attempt);
    }
}

const JOBS = {
    async weather() {
        const rows = [];
        for (const city of WEATHER.cities) {
            rows.push(...weatherRows(city, await get(weatherUrl(city))));
            // three years of one city count as about 80 calls of the free tier's 600 per minute
            await later(10_000);
        }
        return rows;
    },
    async countries() {
        const indicators = {};
        for (const [field, id] of Object.entries(COUNTRIES.indicators)) {
            indicators[field] = await get(indicatorUrl(id));
            await later(1000);
        }
        return countryRows(await get(countriesUrl), indicators);
    },
    async earthquakes() {
        return earthquakeRows(await get(earthquakesUrl()));
    },
    async nobel() {
        const laureates = [];
        for (let offset = 0, count = Infinity; offset < count; ) {
            const page = await get(nobelUrl(offset));
            laureates.push(...page.laureates);
            count = page.meta.count;
            offset += page.laureates.length;
            if (!page.laureates.length) break;
            await later(1000);
        }
        return nobelRows(laureates);
    }
};

const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(JOBS);
for (const name of names) {
    if (!Object.hasOwn(JOBS, name)) throw new Error(`unknown data set "${name}"; known: ${Object.keys(JOBS).join(", ")}`);
    const rows = await JOBS[name]();
    // one row per line: small diffs when a snapshot is fetched again
    const { columns, dicts, rows: packed } = pack(rows);
    const text = `{"fetched":${JSON.stringify(new Date().toISOString().slice(0, 10))},"columns":${JSON.stringify(columns)},"dicts":${JSON.stringify(dicts)},"rows":[\n${packed.map((r) => JSON.stringify(r)).join(",\n")}\n]}\n`;
    await writeFile(new URL(`${name}.json`, out), text);
    console.log(`${name}.json: ${rows.length} rows, ${(text.length / 1024).toFixed(0)} KiB`);
}

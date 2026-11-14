// The example files people download from the site and get from `pivotkit example`: the data of a
// playground data set as the report's Export → Source data writes it (pivotkit-core's dataToCsvBytes),
// and views of the playground's presets as the report's Views → Download view writes them
// (toViewFile), so `pivotkit render <view> --data <data>` gives the report the playground shows.
//
//   node scripts/examples.js                 packages/pivotkit-cli/examples/ (the CLI's package)
//   node scripts/examples.js --docs          the same into docs/assets/examples/ too (the site)
//
// The view files and examples.json are committed (tests/examples.test.js compares them with what
// this script builds, so a change of the view file format turns CI red until they are written again);
// the CSV files are build output: `npm run build -w pivotkit-cli` and prepack write them. In the CLI's
// package each CSV is gzipped (a quarter of its size on disk); `pivotkit example` writes it unpacked.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { encode, normalize, toViewFile, viewFileText } from "pivotkit-core";
import { dataToCsvBytes } from "pivotkit-core/export";
import { DATASETS, sales } from "../examples/playground/src/data.js";
import { unpack } from "../examples/playground/data/sources.js";

const root = new URL("../", import.meta.url);
// the repository's web address, from the CLI's package.json ("git+https://github.com/<owner>/<repo>.git")
const REPOSITORY = JSON.parse(await readFile(new URL("packages/pivotkit-cli/package.json", root), "utf8")).repository.url.replace(/^git\+/, "").replace(/\.git$/, "");

/** Rows of generated sales data: the playground's smallest size, the same rows on every machine. */
export const SALES_ROWS = 2000;

/** The rows of the weather snapshot (the playground reads the same file). */
async function weatherSnapshot() {
    const packed = JSON.parse(await readFile(new URL("examples/playground/data/weather.json", root), "utf8"));
    return { rows: unpack(packed), fetched: packed.fetched };
}

/** A preset of a playground data set by its name. */
function preset(dataset, name) {
    const found = DATASETS[dataset].presets.find((p) => p.name === name);
    if (!found) throw new Error(`examples.js: no preset "${name}" in the playground's ${dataset}`);
    return found;
}

/**
 * A view file as the report writes it (Views → Download view): normalized against the data, with
 * the data set as its source and the fields it uses with their types. No creation time and no
 * generator, so the file is the same on every run.
 */
function viewFile(dataset, presetName, encoded, description) {
    const { view, issues } = normalize(preset(dataset, presetName).view, encoded);
    const errors = issues.filter((i) => i.severity !== "warning");
    if (errors.length) throw new Error(`examples.js: ${presetName}: ${errors.map((i) => i.message).join("; ")}`);
    return viewFileText(toViewFile(view, { name: presetName, ...(description ? { description } : {}), source: { id: dataset, name: DATASETS[dataset].label }, data: encoded }));
}

const WEATHER_CREDIT = "Weather data by Open-Meteo.com (https://open-meteo.com/), CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Contains modified Copernicus Climate Change Service information 2023 (ERA5) and 2019 (ERA5-Land), and ECMWF IFS data.";

/** The attribution and the changes CC BY asks for, written next to the weather files. */
const WEATHER_SOURCE = `weather.csv: daily weather of 14 cities, 2023-01-01 to 2025-12-31, fetched on {fetched}.

Source: Open-Meteo Historical Weather API, https://open-meteo.com/ ("best match": ECMWF IFS, ERA5, ERA5-Land)
Licence: CC BY 4.0, https://creativecommons.org/licenses/by/4.0/
Attribution: Weather data by Open-Meteo.com. Contains modified Copernicus Climate Change Service
information 2023 (ERA5) and 2019 (ERA5-Land), and ECMWF IFS data. Neither the European Commission
nor ECMWF is responsible for any use that may be made of the Copernicus information or data it
contains.

Changes made: the five daily variables of 14 cities in each city's time zone; sunshine converted from
seconds to hours (one decimal); added: city, country, continent, the meteorological season (swapped
south of the equator) and "Rain day" (1 for at least 1 mm of rain).

How it was fetched and mapped: {repository}/blob/main/examples/playground/data/SOURCES.md
Share the data with this attribution and licence.
`;

/**
 * Every example: its files (name -> text or bytes) and its entry in examples.json.
 * @returns {Promise<{ files: Map<string, string | Uint8Array>, manifest: string }>}
 */
export async function buildExamples() {
    const files = new Map();
    const entries = [];

    const salesData = encode(sales(SALES_ROWS));
    files.set("sales.csv", dataToCsvBytes(salesData));
    files.set("sales.pivotkit.json", viewFile("sales", "Revenue by region and category", salesData));
    files.set("sales-chart.pivotkit.json", viewFile("sales", "Monthly revenue trend (chart)", salesData));
    entries.push({
        name: "sales",
        text: `Generated sales, ${SALES_ROWS.toLocaleString("en-US")} rows: revenue by region and category, and a monthly chart`,
        files: ["sales.csv", "sales.pivotkit.json", "sales-chart.pivotkit.json"],
        data: "sales.csv",
        view: "sales.pivotkit.json",
        about: {
            "sales.csv": `the data: ${SALES_ROWS.toLocaleString("en-US")} rows of generated sales, as the report's Export → Source data writes it`,
            "sales.pivotkit.json": "a view: Revenue by region and category (a table)",
            "sales-chart.pivotkit.json": "a view: Monthly revenue trend (a line chart)"
        },
        default: true
    });

    const weather = await weatherSnapshot();
    const weatherData = encode(weather.rows);
    files.set("weather.csv", dataToCsvBytes(weatherData));
    files.set("weather.pivotkit.json", viewFile("weather", "How warm is each city, month by month?", weatherData, WEATHER_CREDIT));
    files.set("weather-SOURCE.txt", WEATHER_SOURCE.replace("{fetched}", weather.fetched).replace("{repository}", REPOSITORY));
    entries.push({
        name: "weather",
        text: `Daily weather of 14 cities, 2023-2025, ${weatherData.length.toLocaleString("en-US")} rows: the mean temperature per city and month`,
        files: ["weather.csv", "weather.pivotkit.json", "weather-SOURCE.txt"],
        data: "weather.csv",
        view: "weather.pivotkit.json",
        about: {
            "weather.csv": `the data: ${weatherData.length.toLocaleString("en-US")} days of 14 cities, as the playground's Export → Source data writes it`,
            "weather.pivotkit.json": "a view: How warm is each city, month by month? (the playground's start)",
            "weather-SOURCE.txt": "where the data comes from and its licence (CC BY 4.0): keep it with the data"
        },
        credit: WEATHER_CREDIT
    });

    return { files, manifest: `${JSON.stringify({ examples: entries }, null, 2)}\n` };
}

/**
 * Writes the examples into a directory (with examples.json); `gzip`: each CSV as <name>.gz.
 * @param {URL} dir
 * @param {{ files: Map<string, string | Uint8Array>, manifest: string }} built
 * @param {{ gzip?: boolean }} [options]
 */
export async function writeExamples(dir, built, { gzip = false } = {}) {
    await mkdir(dir, { recursive: true });
    for (const [name, body] of built.files) {
        const packed = gzip && name.endsWith(".csv");
        await writeFile(new URL(packed ? `${name}.gz` : name, dir), packed ? gzipSync(body, { level: 9 }) : body);
    }
    await writeFile(new URL("examples.json", dir), built.manifest);
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const built = await buildExamples();
    const targets = [{ dir: new URL("packages/pivotkit-cli/examples/", root), gzip: true }, ...(process.argv.includes("--docs") ? [{ dir: new URL("docs/assets/examples/", root), gzip: false }] : [])];
    for (const { dir, gzip } of targets) {
        await writeExamples(dir, built, { gzip });
        console.log(`${dir.pathname.slice(root.pathname.length)}: ${[...built.files.keys()].map((n) => (gzip && n.endsWith(".csv") ? `${n}.gz` : n)).join(", ")}, examples.json`);
    }
}

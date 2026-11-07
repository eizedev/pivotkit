// Every number the "Learn with real data" page (docs/learn.md) states, computed again from the
// playground's snapshots with plain JavaScript: when a snapshot is fetched again and a number moves,
// this test names the sentence to change. The browser test (tests/browser/real-data.spec.js) checks
// that the playground shows the same numbers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { unpack } from "../examples/playground/data/sources.js";

const root = new URL("../", import.meta.url);
const page = readFileSync(new URL("docs/learn.md", root), "utf8").replace(/\s+/g, " ").replace(/‑/g, "-");
const load = (name) => unpack(JSON.parse(readFileSync(new URL(`examples/playground/data/${name}.json`, root), "utf8")));

const sum = (list) => list.reduce((s, x) => s + x, 0);
const avg = (list) => sum(list) / list.length;
const int = (x) => x.toLocaleString("en-US");
const one = (x) => x.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const compact = (x) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(x);
const pct = (x) => `${one(x * 100)} %`;
const by = (list, key) => Object.entries(Object.groupBy(list, typeof key === "function" ? key : (x) => x[key]));
const ranked = (groups, score) => groups.map(([k, l]) => [k, score(l)]).sort((a, b) => b[1] - a[1]);

/** The page states `text`. */
function says(text) {
    assert.ok(page.includes(text), `docs/learn.md should say: ${text}`);
}

test("the data set table: rows per data set", () => {
    says(`| 15,344 days |`);
    says(`| 4,340 country-years |`);
    says(`| 8,559 quakes |`);
    says(`| 1,036 prizes |`);
    says(`| 9,374 release cycles |`);
    assert.equal(load("weather").length, 15344);
    assert.equal(load("countries").length, 4340);
    assert.equal(load("earthquakes").length, 8559);
    assert.equal(load("nobel").length, 1036);
    assert.equal(load("endoflife").length, 9374);
    says(`Software end of life, ${new Set(load("endoflife").map((x) => x.Product)).size} products`);
    says(`${new Set(load("countries").map((x) => x.Country)).size} countries from 2005 to 2024`);
});

test("weather", () => {
    const w = load("weather");
    const month = (city, m) => avg(w.filter((x) => x.City === city && x.Date.slice(5, 7) === m).map((x) => x["Mean °C"]));
    // the coldest city on average and the warmest city-month
    const cities = ranked(by(w, "City"), (l) => avg(l.map((x) => x["Mean °C"])));
    assert.equal(cities.at(-1)[0], "Reykjavik");
    says(`Reykjavik is the coldest city (${one(month("Reykjavik", "01"))} °C in January)`);
    const cells = by(w, (x) => `${x.City}|${x.Date.slice(5, 7)}`).map(([k, l]) => [k, avg(l.map((x) => x["Mean °C"]))]).sort((a, b) => b[1] - a[1]);
    assert.equal(cells[0][0], "Dubai|08");
    says(`Dubai the hottest (${one(cells[0][1])} °C in August)`);

    const sun = ranked(by(w, "City"), (l) => avg(l.map((x) => x["Sunshine h"])));
    says(`${sun[0][0]} (${one(sun[0][1])} hours a day), ${sun[1][0]} (${one(sun[1][1])}) and ${sun[2][0]} (${one(sun[2][1])})`);
    says(`${sun[3][0]} and ${sun[4][0]} follow`);

    const y25 = w.filter((x) => x.Date.startsWith("2025"));
    const rain = ranked(by(y25, "City"), (l) => sum(l.map((x) => x["Rain day"])));
    says(`${rain[0][0]} has the most rain days (${rain[0][1]} in 2025), ${rain.at(-1)[0]} the fewest (${rain.at(-1)[1]})`);
    const season = (city, s) => sum(y25.filter((x) => x.City === city && x.Season === s).map((x) => x["Rain day"]));
    const cape = sum(y25.filter((x) => x.City === "Cape Town").map((x) => x["Rain day"]));
    says(`Half of Cape Town's ${cape} fall in its winter (${season("Cape Town", "Winter")})`);
    says(`Mumbai has none in winter and ${season("Mumbai", "Summer")} in its summer monsoon`);
    assert.equal(season("Mumbai", "Winter"), 0);

    const berlin = by(w.filter((x) => x.City === "Berlin"), (x) => x.Date.slice(0, 7)).map(([k, l]) => [k, avg(l.map((x) => x["Mean °C"]))]).sort((a, b) => a[1] - b[1]);
    assert.equal(berlin[0][0], "2025-02");
    says(`February 2025 was the coldest month of the three years (${one(berlin[0][1])} °C), February 2024 a mild one (${one(berlin.find(([k]) => k === "2024-02")[1])} °C)`);
});

test("countries", () => {
    const c = load("countries");
    const year = (y) => c.filter((x) => x.Year === y);
    const total = (list, f) => sum(list.map((x) => x[f] ?? 0));
    const eap = year(2024).filter((x) => x.Region === "East Asia & Pacific").sort((a, b) => b.Population - a.Population).slice(0, 3);
    says(`(${eap.map((x) => `${x.Country} ${compact(x.Population)}`).join(", ")}) add up to ${compact(total(eap, "Population"))}`);
    const india = year(2024).find((x) => x.Country === "India");
    says(`South Asia follows with India (${compact(india.Population)})`);

    const share = (y, region) => total(year(y).filter((x) => x.Region === region), "CO2 (Mt)") / total(year(y), "CO2 (Mt)");
    says(`East Asia & Pacific's share grew from ${pct(share(2005, "East Asia & Pacific"))} (2005) to ${pct(share(2024, "East Asia & Pacific"))} (2024); North America's fell from ${pct(share(2005, "North America"))} to ${pct(share(2024, "North America"))}`);

    const gdp = (y) => total(year(y), "GDP (US$)");
    says(`2020 shrank the world's GDP by ${one(-(gdp(2020) / gdp(2019) - 1) * 100)} %, 2021 grew it by ${one((gdp(2021) / gdp(2020) - 1) * 100)} %`);

    const bn = (x) => one(x / 1e9);
    says(`from ${bn(total(year(2005), "Population"))} billion people in 2005 to ${bn(total(year(2024), "Population"))} billion in 2024`);
    const growth = ranked(by(c.filter((x) => x.Year === 2005 || x.Year === 2024), "Income group"), (l) => total(l.filter((x) => x.Year === 2024), "Population") - total(l.filter((x) => x.Year === 2005), "Population"));
    assert.equal(growth[0][0], "Lower middle income");
    const lmi = (y) => total(year(y).filter((x) => x["Income group"] === "Lower middle income"), "Population");
    says(`the lower middle income group grew the most, from ${bn(lmi(2005))} to ${bn(lmi(2024))} billion`);
});

test("earthquakes", () => {
    const q = load("earthquakes");
    const low = q.filter((x) => x.Magnitude < 5).length;
    says(`three in four quakes (${pct(low / q.length)}) are between 4.5 and 5; one is between 8.5 and 9`);
    assert.equal(q.filter((x) => x.Magnitude >= 8.5 && x.Magnitude < 9).length, 1);
    says(`4 – 5 holds the same ${int(low)} quakes, as none is below 4.5`);
    assert.equal(q.filter((x) => x.Magnitude < 4.5).length, 0);

    const regions = ranked(by(q, "Region"), (l) => l.length);
    says(`${regions[0][0]} leads with ${int(regions[0][1])} quakes`);
    says(`${regions[1][0]} (${int(regions[1][1])}) and ${regions[2][0]} (${int(regions[2][1])}) follow`);
    const top = q.reduce((a, b) => (b.Magnitude > a.Magnitude ? b : a));
    assert.equal(top.Magnitude, 8.8);
    assert.equal(top.Time.slice(0, 10), "2025-07-29");
    says(`magnitude 8.8 quake off Kamchatka on 29 July`);
    says(`Most quakes (${int(q.filter((x) => x["Depth km"] < 100).length)} of ${int(q.length)}) are shallower than 100 km`);

    const strong = q.filter((x) => x.Magnitude >= 7);
    says(`${strong.length} quakes of 7 and more; Russia has four`);
    assert.equal(strong.filter((x) => x.Region === "Russia").length, 4);

    const july = q.filter((x) => x.Time.startsWith("2025-07"));
    says(`July stands out with ${int(july.length)} quakes`);
    says(`${july.filter((x) => x.Region === "Russia").length} of July's ${int(july.length)} quakes were in Russia`);
});

test("Nobel laureates", () => {
    const n = load("nobel");
    const cats = ranked(by(n, "Category"), (l) => l.length);
    says(`${cats[0][0]} has the most laureates (${cats[0][1]}), then ${cats[1][0]} (${cats[1][1]})`);
    says(`Economic Sciences starts in 1969, so its first decade has ${n.filter((x) => x.Category === "Economic Sciences" && x.Year < 1970).length}`);
    assert.equal(Math.min(...n.filter((x) => x.Category === "Economic Sciences").map((x) => x.Year)), 1969);

    const people = n.filter((x) => x.Type === "Person");
    const women = (list) => list.filter((x) => x.Gender === "Female").length / list.length;
    const of = (cat) => people.filter((x) => x.Category === cat);
    says(`${pct(women(people))} of all laureates are women; ${pct(women(of("Peace")))} in Peace, ${pct(women(of("Physics")))} in Physics`);

    const countries = by(n.filter((x) => x.Country), "Country").sort((a, b) => b[1].length - a[1].length).slice(0, 10);
    says(`${countries.slice(0, 3).map(([c, l]) => `${c} ${l.length}`).join(", ")}`);
    const ages = countries.flatMap(([, l]) => l.map((x) => x["Age at award"])).filter((x) => x !== null);
    says(`were ${Math.round(avg(ages))} years old on average when they won`);
});

test("software end of life", () => {
    const e = load("endoflife");
    const blank = e.filter((x) => x["EOL date"] === null);
    says(`${int(blank.length)} cycles have no known end of life`);
    says(`and ${blank.filter((x) => x.EOL).length} of them are EOL all the same`);

    const years = ranked(by(e.filter((x) => x["EOL date"]), (x) => x["EOL date"].slice(0, 4)), (l) => l.length);
    assert.equal(years[0][0], "2026");
    says(`2026 has the most, ${int(years[0][1])} release cycles; ${years[1][0]} follows with ${int(years[1][1])}`);
    says(`${blank.filter((x) => !x.EOL).length} supported cycles have no end date yet`);
    says(`Server apps stand out: ${e.filter((x) => x["EOL date"]?.startsWith("2026") && x.Category === "Server app").length} of 2026's cycles`);

    const maintained = ranked(by(e.filter((x) => x.Maintained), "Product"), (l) => l.length);
    says(`${maintained.slice(0, 3).map(([p, n]) => `${p} ${n}`).join(", ")}`);

    const known = e.filter((x) => x["Support years"] !== null);
    const short = (list) => list.filter((x) => x["Support years"] < 2).length / list.length;
    says(`${pct(short(known))} of all release cycles with a known end are supported for less than 2 years; of the devices only ${pct(short(known.filter((x) => x.Category === "Device")))}`);

    const years2 = (list) => one(avg(list.map((x) => x["Support years"])));
    const lang = known.filter((x) => x.Category === "Language");
    says(`${years2(known.filter((x) => x.LTS))} years with LTS against ${years2(known.filter((x) => !x.LTS))} without`);
    says(`Languages differ most: ${years2(lang.filter((x) => x.LTS))} years against ${years2(lang.filter((x) => !x.LTS))}`);
    const sorted = lang.filter((x) => !x.LTS).map((x) => x["Support years"]).sort((a, b) => a - b);
    const mid = sorted.length / 2;
    const median = sorted.length % 2 ? sorted[Math.floor(mid)] : (sorted[mid - 1] + sorted[mid]) / 2;
    // the cell keeps the data set's one decimal for "Support years"; the text names the exact median too
    says(`Languages without LTS drop to ${one(median)} years (${median.toLocaleString("en-US")}, shown with the one decimal`);

    const next = e.filter((x) => x["Days to EOL"] !== null && x["Days to EOL"] >= 0 && x["Days to EOL"] < 365);
    const cats = ranked(by(next, "Category"), (l) => l.length);
    assert.equal(cats[0][0], "Server app");
    says(`${next.length} release cycles end within a year of the snapshot; server apps have the most (${cats[0][1]})`);
});

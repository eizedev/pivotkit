// What each field of the real data sets means (fieldDefaults `description` and `href`), merged over
// the data sets' own fieldDefaults by `withDescriptions`. Quoted from the source where it documents
// the field (Open-Meteo's variable list, the World Bank's indicator notes, the endoflife.date API's
// OpenAPI document, read with pivotkit-core's fieldDefaultsFromSchema); otherwise it says how
// data/sources.js made the field from the response. The generated data sets have none: they show a
// report as it is without descriptions.

import { fieldDefaultsFromSchema } from "pivotkit-core";
import endoflifeApi from "../data/endoflife-openapi.json";

const OPEN_METEO = "https://open-meteo.com/en/docs/historical-weather-api";
const WORLD_BANK = (code) => `https://data.worldbank.org/indicator/${code}`;
const USGS = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php";
const NOBEL = "https://www.nobelprize.org/about/developer-zone-2/";

const ENDOFLIFE_DOCS = "https://endoflife.date/docs/api/v1/";
const release = fieldDefaultsFromSchema(endoflifeApi, { schema: "ProductRelease" });
const product = fieldDefaultsFromSchema(endoflifeApi, { schema: "ProductSummary" });
const version = fieldDefaultsFromSchema(endoflifeApi, { schema: "ProductVersion" });
/** A field of the API's schema as the description of a column of data/sources.js (endoflifeRows). */
const fromApi = (entry, more = "") => ({ description: `${entry.description}${more}`, href: ENDOFLIFE_DOCS });

/** Per data set: per field, its description and a link to the source's documentation. */
export const DESCRIPTIONS = {
    weather: {
        City: { description: "One of the 14 cities of the data set; the values are for its coordinates." },
        Date: { description: "The day, in the city's own time zone." },
        Season: { description: "The meteorological season of the day's month; south of the equator the seasons are swapped." },
        "Max °C": { description: "Maximum daily air temperature at 2 meters above ground (Open-Meteo, temperature_2m_max).", href: OPEN_METEO },
        "Min °C": { description: "Minimum daily air temperature at 2 meters above ground (Open-Meteo, temperature_2m_min).", href: OPEN_METEO },
        "Mean °C": { description: "Mean daily air temperature at 2 meters above ground (Open-Meteo, temperature_2m_mean).", href: OPEN_METEO },
        "Rain mm": { description: "Sum of daily precipitation (including rain, showers and snowfall), in millimetres (Open-Meteo, precipitation_sum).", href: OPEN_METEO },
        "Rain day": { description: "1 on a day with at least 1 mm of precipitation, else 0: its sum counts the rain days, its average is their share." },
        "Sunshine h": {
            description: "Hours of sunshine: Open-Meteo's sunshine_duration, the seconds per day with direct normalized irradiance above 120 W/m² (the WMO definition), in hours.",
            href: OPEN_METEO
        }
    },
    countries: {
        Population: {
            description: "Population, total: based on the de facto definition of population, which counts all residents regardless of legal status or citizenship. The values shown are midyear estimates (World Bank, SP.POP.TOTL).",
            href: WORLD_BANK("SP.POP.TOTL")
        },
        "GDP (US$)": {
            description: "GDP (current US$): the total income earned through the production of goods and services in an economic territory during an accounting period, in current prices (no adjustment for price changes over time), in United States dollars (World Bank, NY.GDP.MKTP.CD).",
            href: WORLD_BANK("NY.GDP.MKTP.CD")
        },
        "CO2 (Mt)": {
            description: "Carbon dioxide (CO2) emissions excluding LULUCF, in megatonnes of CO2 equivalent: annual emissions from the agriculture, energy, waste and industrial sectors, standardized with the Global Warming Potential factors of IPCC's 5th Assessment Report (World Bank, EN.GHG.CO2.MT.CE.AR5).",
            href: WORLD_BANK("EN.GHG.CO2.MT.CE.AR5")
        },
        Region: { description: "The World Bank's region of the country." },
        "Income group": { description: "The World Bank's income group of the country (low, lower middle, upper middle, high income)." },
        Code: { description: "The country's ISO 3166-1 alpha-3 code." }
    },
    earthquakes: {
        Time: { description: "When the earthquake happened, in UTC, to the second.", href: USGS },
        Magnitude: { description: "The magnitude USGS reports for the event (the data set has every event of 4.5 or more).", href: USGS },
        "Depth km": { description: "The depth of the event in kilometres, the third coordinate of its location.", href: USGS },
        Place: { description: "USGS's description of where the event was, such as \"92 km S of Lakatoro, Vanuatu\".", href: USGS },
        Region: { description: "The part of the place after its last comma (\"Vanuatu\"), or the whole place when it has none." },
        Alert: { description: "Green, yellow, orange or red when USGS's PAGER estimated the impact of the event; blank otherwise.", href: USGS },
        "Tsunami flag": { description: "Yes when USGS set its tsunami flag, which it does for large events in oceanic regions. It does not say that a tsunami happened.", href: USGS }
    },
    endoflife: {
        Product: fromApi(product.label),
        Category: fromApi(product.category),
        Cycle: fromApi(release.name),
        Released: fromApi(release.releaseDate),
        "EOL date": fromApi(release.eolFrom),
        EOL: fromApi(release.isEol),
        Maintained: fromApi(release.isMaintained),
        LTS: fromApi(release.isLts),
        "Active support until": fromApi(release.eoasFrom),
        "Latest version": fromApi(version.name, " (the latest version of the release cycle)"),
        "Latest release": fromApi(version.date, " (of the latest version)"),
        Tags: fromApi(product.tags),
        "Support years": { description: "Years from the release to the end of life (365.25 days a year), cut to 0.01; blank without an end-of-life date." },
        "Days to EOL": { description: "Days from the day the API generated the data to the end of life; negative when it lies back." },
        "Release year": { description: "The year of the release date." }
    },
    nobel: {
        Laureate: { description: "The laureate's known name, or the organization's name." },
        Share: { description: "The laureate's portion of the prize: 1/3 each when three share it, so the shares of one prize add up to 1.", href: NOBEL },
        "Age at award": { description: "The award year minus the laureate's birth year; blank for organizations." },
        Country: { description: "Where the person was born or the organization founded, in today's borders.", href: NOBEL }
    }
};

/**
 * A data set's fieldDefaults with the descriptions of DESCRIPTIONS added; the same object when the
 * data set has none.
 * @param {Record<string, object> | undefined} defaults
 * @param {string} dataset
 */
export function withDescriptions(defaults, dataset) {
    const extra = Object.hasOwn(DESCRIPTIONS, dataset) ? DESCRIPTIONS[dataset] : null;
    if (!extra) {
        return defaults;
    }
    const out = { ...defaults };
    for (const [field, d] of Object.entries(extra)) {
        out[field] = { ...out[field], ...d };
    }
    return out;
}

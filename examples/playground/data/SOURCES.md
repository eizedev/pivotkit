# Sources of the real data sets

The playground's four real data sets are snapshots of public data, fetched once with
`npm run docs:data` (`scripts/docs-data.js`) and committed here. The playground and the browser tests
read only these files; nothing calls the APIs at run time. The requests and the mapping from each
response to rows are in [sources.js](sources.js), the one place the script, the documentation
("Learn with real data" on <https://pivotkit.eize.dev/learn/>) and anyone querying the sources live
take them from.

pivotkit's code is MIT licensed; these data files are not code and keep the licence of their source.

| File | Rows | Source | Licence | Attribution |
| --- | --- | --- | --- | --- |
| `weather.json` | 15,344 | [Open-Meteo](https://open-meteo.com/) Historical Weather API ("best match": ECMWF IFS, ERA5, ERA5-Land) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | "Weather data by Open-Meteo.com", linked to open-meteo.com, next to the data, and the Copernicus attribution below |
| `countries.json` | 4,340 | [World Bank](https://data.worldbank.org/), World Development Indicators | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | "World Bank, World Development Indicators" |
| `earthquakes.json` | 8,559 | [U.S. Geological Survey](https://earthquake.usgs.gov/), ANSS Comprehensive Earthquake Catalog (ComCat) | U.S. public domain | "U.S. Geological Survey" (credit asked for, not required) |
| `nobel.json` | 1,036 | [Nobel Prize Outreach](https://www.nobelprize.org/about/developer-zone-2/), api.nobelprize.org 2.1 | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) | "Nobel Prize Outreach, api.nobelprize.org" (citing the source is encouraged) |

Fetched on 2026-11-07 (the `fetched` key of each file). The terms below were read on that day; they
can change, so read them again before you fetch.

## Changes made to the data

CC BY asks to say what was changed. The changes are the mapping functions in `sources.js`:

- Weather: the five daily variables of 14 cities for 2023-01-01 to 2025-12-31 in each city's time
  zone; sunshine converted from seconds to hours (one decimal); added: city, country, continent, the
  meteorological season (swapped south of the equator) and "Rain day" (1 for at least 1 mm of rain).
- Countries: three indicators for 2005 to 2024 joined per country and year with the region and
  income group of the country list; aggregates (World, regions, income groups) left out; GDP rounded
  to whole US dollars; trailing spaces of a few region names removed.
- Earthquakes: magnitude 4.5 and more, 2025-01-01 to 2025-12-31 UTC, event type earthquake; time to
  the second, depth to 0.1 km, coordinates to 0.01 degree; "Region" is the place name after its last
  comma, without the year and "Earthquake" of named events.
- Nobel laureates: one row per prize of a laureate (persons and organizations), to the prizes of 2026;
  "Country" is the birth country of a person or the founding country of an organization, in today's
  borders as the API names it; "Age at award" is the award year minus the birth year; "Share" is the
  portion of the prize (1/3 is 0.333...).

A snapshot stores the rows as arrays in the order of `columns`, with the text of few-valued columns as
an index into `dicts`; `unpack()` in `sources.js` turns it back into an array of objects.

## Open-Meteo (weather.json)

- Request: `https://archive-api.open-meteo.com/v1/archive?latitude=52.52&longitude=13.41&start_date=2023-01-01&end_date=2025-12-31&daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,sunshine_duration&timezone=auto`,
  one per city (`weatherUrl(city)`), mapped by `weatherRows(city, response)`.
- Key: none for non-commercial use; commercial use needs a subscription and an `apikey`
  ([terms](https://open-meteo.com/en/terms), [pricing](https://open-meteo.com/en/pricing)).
- Limits of the free API: 600 calls per minute, 5,000 per hour, 10,000 per day, 300,000 per month;
  a request of more than 10 variables or more than two weeks counts as several calls (three years of
  one city are about 80). The script waits 10 seconds between cities.
- Licence: [CC BY 4.0](https://open-meteo.com/en/licence); the attribution is shown next to the data
  in the playground's header.
- Underlying data: Open-Meteo's "best match" combines ECMWF IFS, ERA5 and ERA5-Land
  ([documentation](https://open-meteo.com/en/docs/historical-weather-api)). ERA5 and ERA5-Land come
  from the Copernicus Climate Change Service (C3S), licensed
  [CC BY 4.0](https://cds.climate.copernicus.eu/datasets/reanalysis-era5-single-levels) in the
  Climate Data Store since 2 July 2025; ECMWF's open data is CC BY 4.0 as well
  ([ECMWF open data](https://www.ecmwf.int/en/forecasts/datasets/open-data)). The Climate Data Store
  asks users to attribute the Copernicus programme with this text, which the playground shows under
  the Open-Meteo credit and the documentation repeats:

  > Contains modified Copernicus Climate Change Service information 2023 (ERA5) and 2019 (ERA5-Land),
  > and ECMWF IFS data. Neither the European Commission nor ECMWF is responsible for any use that may
  > be made of the Copernicus information or data it contains.

  The years are those of the two catalogue entries the Climate Data Store gives for its citation:
  Copernicus Climate Change Service (2023): ERA5 hourly data on single levels from 1940 to present,
  C3S Climate Data Store (CDS), DOI [10.24381/cds.adbb2d47](https://doi.org/10.24381/cds.adbb2d47);
  Copernicus Climate Change Service (2019): ERA5-Land hourly data from 1950 to present, C3S CDS, DOI
  [10.24381/cds.e2161bac](https://doi.org/10.24381/cds.e2161bac). Accessed through Open-Meteo on
  2026-11-07.
- The free API is for non-commercial use only. This snapshot was fetched once for the documentation of
  an open-source project without ads; if you query Open-Meteo from a commercial product, you need
  their commercial plan.

## World Bank (countries.json)

- Requests: `https://api.worldbank.org/v2/country?format=json&per_page=400` (`countriesUrl`) and, per
  indicator, `https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL?format=json&date=2005:2024&per_page=20000`
  (`indicatorUrl(id)`), mapped by `countryRows(countries, indicators)`. The indicators:
  `SP.POP.TOTL` (population), `NY.GDP.MKTP.CD` (GDP in current US$), `EN.GHG.CO2.MT.CE.AR5` (CO2
  excluding LULUCF, Mt CO2e; source: EDGAR, European Commission JRC).
- Key: none ([API documentation](https://datahelpdesk.worldbank.org/knowledgebase/articles/889392)).
  No rate limit is documented; the script waits a second between requests.
- Licence: [CC BY 4.0](https://datacatalog.worldbank.org/public-licenses#cc-by), the default for
  World Bank data and the `License_Type` of each of the three indicators in their metadata.
- Why the World Bank and not Our World in Data: one API gives the indicators together with each
  country's region and income group, under one licence; Our World in Data's CO2 data set has no
  income group and takes its GDP from another source.

## USGS (earthquakes.json)

- Request: `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=2025-01-01&endtime=2026-01-01&minmagnitude=4.5&eventtype=earthquake&orderby=time-asc`
  (`earthquakesUrl()`), mapped by `earthquakeRows(response)`.
- Key: none ([FDSN event service](https://earthquake.usgs.gov/fdsnws/event/1/)). At most 20,000 events
  per request; no rate limit is documented, the service asks automated applications to prefer its
  real-time feeds.
- Licence: data produced by the USGS is in the U.S. public domain; credit is asked for
  ([copyrights and credits](https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits)).
- "Tsunami flag" is USGS's `tsunami` property: set for large events in oceanic regions. It does not
  say that a tsunami happened.

## Nobel Prize Outreach (nobel.json)

- Request: `https://api.nobelprize.org/2.1/laureates?offset=0&limit=1000&sort=asc`, page by page until
  `meta.count` (`nobelUrl(offset)`), mapped by `nobelRows(laureates)`.
- Key: none ([developer zone](https://www.nobelprize.org/about/developer-zone-2/)); no rate limit is
  documented, the terms ask to keep the load low and use a local cache.
- Licence: [CC0](https://www.nobelprize.org/about/terms-of-use-for-api-nobelprize-org-and-data-nobelprize-org/).
  The terms also ask not to alter the data in a misleading way and not to use Nobel Prize Outreach's
  name or logos in a way that implies endorsement; the playground names the source only.

## Fetching again

```bash
npm run docs:data              # all four
npm run docs:data -- weather   # one or more by name
```

The script sends a generic User-Agent and no contact details. Look at the diff before committing: a
new fetch can bring revised numbers (the World Bank and USGS revise past values), and the browser
tests in `tests/browser/real-data.spec.js` compute their expected numbers from the snapshot, so they
follow.

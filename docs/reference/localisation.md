---
title: Localisation
description: Languages, number and date formats, and how to change single texts of the pivotkit report or add a language of your own.
---

# Localisation

Two settings decide how a report reads:

- **`locale`** is a prop or attribute, default `"en-US"`. It sets numbers, dates, currency, sorting,
  and the language of the labels.
    - A locale starting with `de` picks German. Every other locale picks English.
    - A view's own `formatting.locale` wins for the numbers and dates of that report.
    - The report never uses the browser's language, so a report looks the same for everyone.
    - On the web component, the report uses the element's own `lang` attribute when `locale` is not
      set.
- **`labels`**: single texts merged over the language's labels.

![The report in German](../assets/screenshots/german-light.png#only-light)
![The report in German](../assets/screenshots/german-dark.png#only-dark)

## Built-in languages

| Language | Picked by | Labels |
| --- | --- | --- |
| English | every locale not listed below | `LABELS.en` |
| German | `de`, `de-DE`, `de-AT`, `de-CH`, ... | `LABELS.de` |

pivotkit-react exports `LABELS` from its subpath `pivotkit-react/labels`:
`import { LABELS } from "pivotkit-react/labels"`. It is a subpath of its own, so the report's first
load does not carry the menus' texts. Its keys are the reference for every text. In pivotkit-react's
source, they live in `src/labels.js`, `src/labels-de.js`, `src/menu-labels.js`,
`src/menu-labels-de.js`, `src/unused-texts.js`, `src/unused-texts-de.js` and `src/import-labels.js`.

The texts of the tabs and the zones' section are `table`, `chart`, `tableSettings`, `chartSettings`,
`settingsShort` (the settings button on a phone), `zonesTitle`, `zonesHint` and `more`. "+ Add" in
each zone is `addField`, named by `addFieldTo`; its menu adds `addAlready`, `addMoves` and
`addSecond`. After a pick, the zones' status line says `steps.added` ("{field} added to {zone}") or
`movedFrom` ("{field} moved from {from} to {zone}"). `steps.added` is a key inside `steps`, the
texts of "Undone: …": set it as `labels: { steps: { added: "…" } }`. The menus' texts include `helpAndShortcuts`, `help`, `chartShowEach`, `chartShowOnly`, `chartShowDetails`,
`chartShowTotals`, `chartFoldEach`, `chartFoldOnly` and `chartFoldSome`. `LABELS.en` lists them all.

The report ignores the keys `layout`, `showLayout`, `options` and `chartDisplay`. It says once in the
console which key holds that text now.

The report's `lang` attribute follows the labels, so screen readers use the right voice.

The web component loads the German texts of the first render as a file of its own:

- Only a German report loads it, before it renders. Until then the report shows its skeleton without
  a word. It never shows English first.
- A report that changes to German keeps its English texts until the German ones are there.
- When the file cannot load, or does not arrive within 4 seconds, the report shows in English and
  says so once in the console. German texts that arrive later still take their place.
- A report that mounts after such a failure shows English at once and tries the file again. It
  takes the German texts when they arrive.

pivotkit-react has these texts at once.

The texts that only the menus show load with the menus, right after the first render:

- The English texts come with the menus.
- The German texts are a file of their own. Only a German report loads it, also when `locale`
  changes to German later.

The file follows the labels' language, not the locale alone. `labels` with `lang: "de"`, such as a
host's whole German object, loads it too. Any other `lang` takes the English menu texts under its
`labels`.

A menu waits for its language's texts and shows "Loading…" until then. It never shows English first.
When the language changes while a menu is open, the menu keeps its texts until the new ones are
there. A host's text for a menu entry wins over the built-in one in every language.

The words that describe a view's [unused parts](../use/behaviour.md#parts-of-a-view-that-were-not-used)
are `labels.unused`. They load only when a view has such parts. English loads first, and a German
report loads German as a second small file. Until they arrive, or when they cannot load, each line
shows pivotkit-core's short English message. German falls back to English.

These parts of the warning are in the first load:

- its title, `unusedParts` (a count)
- the prefix of its technical line, `unusedPath`
- its button for the lines past the first few, `unusedMore` (a count) and `unusedFewer`

`labels.unused.codes` has one text per issue code (`VIEW_ISSUE_CODES` of pivotkit-core). The texts
use the placeholders `{field}`, `{value}`, `{agg}`, `{type}`, `{max}`, `{zone}`, `{setting}` and
`{dropped}`. `{dropped}` is what the report does instead, taken from `labels.unused.dropped` by the
part of the view. Further keys:

- `other` is the text for a code the report does not know.
- `item` puts the subject and the text together (`"{subject}: {text}"`).
- `quote` quotes a key of the view (`"“{key}”"`).
- `position` tells two lines of one name apart (`"{subject} (no. {n} in {part})"`).

The texts of [loading data](../use/load-data.md) are `labels.dataImport`. They cover:

- the Data menu, the drop overlay and the preview
- the readers' notes per note code, in `labels.dataImport.notes`
- a file over a limit, in `overLimit`, with the limit's words in `limitWhat`
- `workbookCells`, for when a workbook's texts and formats reach `importCells`

They load with the import UI, English and German in one file. A host's own language takes English
there unless its `labels` give `dataImport`.

These texts are part of the first load:

- the Data button's text, `data`
- its dot's words for a screen reader, `dataLoaded`
- the empty report's lines and button: `emptyLoad`, `emptyNoData`, `emptyDrop`, `loadData`

`labels.dataImport.formatNames` names the formats of the built-in readers and pivotkit-xlsx by the
reader's `name`. The report shows another plugin's own `label` as it is.

## Changing single texts

The report merges `labels` deeply over the language's labels. It ignores an entry of the wrong type.
`labels.core` holds the texts pivotkit-core writes into the table and the chart: "Grand Total",
"(blank)", "Sum of ...".

```jsx
<PivotReport
    data={rows}
    locale="de-DE"
    labels={{ zones: { values: "Kennzahlen" }, core: { grandTotal: "Summe" } }}
/>
```

```js
// the web component: labels is a property
report.labels = { zones: { values: "Kennzahlen" }, core: { grandTotal: "Summe" } };
```

The report fills in the `{name}` placeholders in a text. A count is an object with one text per
plural category of the language. The counts are `rowsCount`, `rowsFiltered`, `drillCount`,
`chartCategories` and `chartSeries`. The report picks the text with `Intl.PluralRules` for the
labels' `lang`:

```js
{ rowsCount: { one: "{count} row", other: "{count} rows" } }
```

`rowsFiltered` is the row count when a filter leaves rows out ("2,190 of 4,386 rows"). `{count}` is
the data's rows and picks the form. `{shown}` is the rows the filters keep.

A language with more forms adds them (`few`, `many`). A missing form falls back to `other`.

`quote` is how the language quotes, in a sentence, a text the user typed or a field's name. Examples
are "Filter: contains “an”" and "Fields this data does not have: “Country”". It uses the placeholder
`{text}`:

- `"“{text}”"` in English
- `"„{text}“"` in German
- `"« {text} »"` for French

More groups of texts:

- `labels.tips` holds the tips, one text per tip id. `labels.tips.showAs` has one text per
  percentage calculation.
- A text under an earlier key still applies unless `labels.tips` has the tip's own entry. The earlier
  keys are `topNote`, `bottomNote`, `noValuesHint`, `cellHint`, `emptyHint`, `chartManySeries`,
  `chartDatesOnColumns` and `chartCapped`.
- `labels.tipActions` holds the tips' buttons.
- `labels.shortcuts` and `labels.keys` hold the keyboard shortcuts of the help section.

Field names are not labels. A field's display name in any language comes from `fieldDefaults`
(`label`), see [Field descriptions and names](../concepts/fields.md). A host that shows German names
passes German labels there. Views keep the field names, so a saved view works in every language.

## Another language

There is no registry of languages. Another language is a whole labels object with its own `lang`.
Pass it as `labels`, next to the `locale` for its numbers and dates.

```jsx
import { LABELS } from "pivotkit-react/labels";

const fr = { ...LABELS.en, lang: "fr", zones: { ...LABELS.en.zones, rows: "Lignes", cols: "Colonnes" } /* ... */ };

<PivotReport data={rows} locale="fr-FR" labels={fr} />
```

Start from a copy of `LABELS.en`, so every key exists, and translate what you need. Keys you do not
translate stay English.

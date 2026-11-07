---
title: Charts
description: The chart of a pivotkit report - chart types, value labels and where a pie writes them, legend, title, smooth lines, axis labels and group labels in the view, the PNG export, and chartOptions for developers with its precedence.
---

# Charts

**Chart** in the toolbar draws the same report as a chart: bars, stacked bars, horizontal bars,
lines, area, pie (a whole circle), donut (a ring) or heatmap. The categories are the items of Rows, one series per item of Columns and
value. At most 50 categories are drawn, with a note. A click on a bar, a point or a heatmap cell opens
the rows behind it, as in the table. The chart has a text alternative (type, values, counts, highest
and lowest value); its name includes the title when it has one ("Chart: Revenue by region").

## The chart type

Until a type is picked, the chart type is **Automatic** (`chart.type: "auto"`, also for a view
without a type): the data decides.

- A date, or a grouping of one along the time line ("Created by month": day, week, month, quarter,
  year), on Rows: **lines**, the dates along the axis. A grouping that repeats (weekday, hour of day,
  month, quarter or week of year) is categories: **bars**.
- Dates on Columns only: **lines** too, with rows and columns swapped for the chart alone, so the
  dates run along the axis and each item of Rows is a line; the table keeps its layout and the view
  is not changed. A click on a point opens its rows as in the table.
- Anything else: **bars**.

The button next to Table and Chart shows the type ("Automatic", "Bars"; for a screen reader "Chart
type: Bars"), and "Automatic" in its menu says what it draws now ("Now: Lines"). A type the user
picks stays. When that type is not lines over dates (bars, a pie), a tip offers **Show as lines over
time**, which goes back to Automatic in one step Undo takes back. A pie or a donut of more than about
7 slices gets a tip with **Switch to Bars**; a pie with a field on Columns says that it adds the
columns up into one slice per row. A heatmap's colour scale writes its ends in the value's number
format.

For developers: pivotkit-core's `autoChartType(view, data)` says what "auto" stands for (`"line"`
with a date along the time line on Rows, else `"bar"`) and `toEChartsOption()` draws it; the swap for dates on Columns is
the UI's (pivotkit-react computes the chart from the swapped view).

## Display settings (for the people who use the report)

The chart type menu has a **Display** section under the chart types (both sections fold, see
[long menus](../guide.md#menus-that-are-long)). Each choice applies at once and the menu stays open,
so the chart behind it shows the change. The settings are part of the view, so a saved view, a link
and the PNG export keep them, and they stay when the chart type changes. An "i" next to Labels and
to Group labels explains them.

| Setting | Choices | Default |
| --- | --- | --- |
| Value labels | Automatic, Off, Value; for a pie and a donut also Percent and Value and percent | Automatic: a pie names its slices, a heatmap writes the numbers while there are 200 cells or fewer, bars and lines write nothing |
| Labels (pie and donut) | Outside, Inside; not offered while value labels are Off | Outside: each slice's name with what is chosen, on a line to the slice. Inside: only the number on the slice (the share for Automatic), in a colour that reads on it; the legend names the slices, and a slice narrower than 12 degrees gets no label |
| Legend | Automatic, Bottom, Right, Off | Automatic: above the chart when there is more than one series (a pie and a donut always) |
| Title | any text; the × removes it at once. A title wider than the chart ends in "…", on screen and in the PNG | none |
| Smooth lines | on, off (lines and area only) | off |
| Axis labels | Automatic, All (slanted), Every n-th (bars, lines and areas) | Automatic |
| Group labels under the axis | Automatic, On, Off (with two or more fields in Rows) | Automatic: shown while the chart has room for them |

![The chart type menu with its Display section: value labels, legend, title](../assets/screenshots/chart-display.png)

**Axis labels.** Automatic writes every category straight when the longest name fits its place,
slanted by 45 degrees when they would overlap, and every n-th one (slanted) when not even that fits;
a line under the chart then says "One label in every 3 is shown". All (slanted) always writes every
label; Every n-th keeps them straight and leaves out as many as needed. A name longer than 120 px ends
in "…"; the tooltip has it whole. Horizontal bars write their names straight, every one while a line
fits each bar.

**Tooltip.** Pointing at a category of bars, lines or areas shows its whole name and one line per
series: the series' colour, its name and the value formatted as in the table. A pie shows the value's
name, the slice and its value; a heatmap the value's name, the cell's row and column and its value.
It is built from text nodes, never from HTML, so nothing from the data is read as markup.

**Group labels.** With two or more fields in Rows (Region, then Country) the axis names each category
by its inner field (the country) and writes the outer field's item (the region) once under its
categories, with a line between two groups. Horizontal bars put the groups left of the names. Off
writes the whole path at each category ("Asia / Japan"). Automatic shows them only where they can be
read: a chart at least 420 x 260 px, and at least 56 px under the axis for the smallest group (28 px
beside it for horizontal bars); in a smaller chart, on a phone say, the axis writes the whole paths
instead. On shows them always.

![Bars of the three largest countries per region, the regions as group labels under the country names](../assets/screenshots/chart-groups.png)

**Lines over categories.** A line or an area connects its points into a trend. Over categories
without an order (countries, teams) that trend means nothing, so a tip says "Lines connect points into
a trend. For categories such as countries, bars fit better." with **Switch to Bars**. It does not show
for dates, number ranges or a custom order (the seasons), and not when the dates are on Columns (that
tip offers to swap).

**PNG export.** Export, "Chart image (.png)" saves the chart as it is drawn, at twice the screen's
resolution: with its title, legend, value labels and group labels.

In the view the settings are `chart.valueLabels` (`"auto"`, `"off"`, `"value"`, `"percent"`,
`"both"`), `chart.labelPosition` (`"outside"`, `"inside"`), `chart.legend` (`"auto"`, `"bottom"`, `"right"`, `"off"`), `chart.title` (text, at most
`limits.name` characters, or `null`), `chart.smooth`, `chart.axisLabels` (`"auto"`, `"all"`, `"nth"`)
and `chart.groupLabels` (`"auto"`, `"on"`, `"off"`). A view without them gets the defaults; an unknown value
falls back to its default and is reported by `normalize()` ([Views](views.md)). "Percent" and "Value
and percent" are a pie's and a donut's; another type writes the value. `chart.type` is `"auto"` (the
default: the data decides, see [the chart type](#the-chart-type)), `"bar"`, `"line"`, `"area"`, `"pie"`,
`"donut"` or `"heatmap"`; a pie and a donut differ only in the hole
(pivotkit-core's `DEFAULT_THEME.pieRadius` `["0%", "70%"]` and `donutRadius` `["42%", "70%"]`, which a
host changes with `toEChartsOption`'s `theme`).

## `chartOptions` (for developers)

`chartOptions` is a plain JSON object merged over the [Apache ECharts](https://echarts.apache.org/en/option.html)
option the report builds, for what the menus do not offer: a font size, axis names, margins, a
colour. It is a prop of pivotkit-react and a property of `<pivot-report>`.

```jsx
<PivotReport
    data={rows}
    chartOptions={{
        textStyle: { fontSize: 13 },
        title: { textStyle: { fontSize: 18 } },
        xAxis: { name: "Region", nameLocation: "middle", nameGap: 32 },
        series: { barMaxWidth: 24 },
        grid: { left: 48 }
    }}
/>
```

```js
document.querySelector("pivot-report").chartOptions = { legend: { textStyle: { fontSize: 14 } } };
```

How it is merged:

- objects key by key, so `{ title: { textStyle: { fontSize: 18 } } }` changes the font size and keeps
  the view's title text;
- a list entry by entry (`series: [{ ... }, { ... }]`), and an object given for a list into every
  entry of it: `{ series: { barMaxWidth: 24 } }` sets every series;
- any other value replaces the report's.

**Precedence.** The report builds the option from the view (its type and display settings), adds its
own styles (the theme's colours, rounded bars, the tooltip), then merges `chartOptions` over all of
it: the host wins. `{ legend: { show: false } }` hides the legend even when the user picked "Bottom",
so keep `chartOptions` to what the user should not change.

**Only JSON.** Strings, finite numbers, booleans, `null`, plain objects and arrays pass. Functions
(formatters), class instances (`Date`, `Map`), symbols, `Infinity`, the keys `__proto__`,
`constructor` and `prototype`, more than 12 levels and more than 2,000 entries are left out, with one
console warning that names them, when the chart is drawn (the check loads with ECharts). It is compared by value, so a host may build a new object on every
render. The report's own formatters (numbers in the user's language) stay.

**No markup, addresses or templates.** Some ECharts options are not data: ECharts writes a string
`formatter` of the tooltip, and the tooltip's `content`, into the page as HTML (`innerHTML`), which
would run what it holds and replace the report's tooltip of plain text nodes (the one a strict
Content-Security-Policy allows); a title's `link` and `sublink` open a window. So these are left out
wherever they are in `chartOptions`, each named in the warning:

| Left out | Why |
| --- | --- |
| a string `formatter` (any depth: tooltip, labels, legend, axes) and a string `content` | written as HTML in the tooltip; the others are templates of the same kind and refer to `rich` |
| `rich` | text styles that templates refer to |
| `link`, `sublink`, `target`, `subtarget`, `linkTarget` | open an address |
| `image` and any text that starts with `image://` (a symbol) | load an address |
| `extraCssText`, `className`, `appendTo`, `appendToBody`, `renderMode` | change the tooltip's element and where it lives |

What is left of `chartOptions` is styles, sizes, numbers and names; nothing in it is markup or an
address, and nothing in it is run. The rule follows ECharts 6.1.0 (its `TooltipHTMLContent` and
`windowOpen`).

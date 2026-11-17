---
title: Charts
description: Show a pivotkit report as a chart - bars, lines, area, pie, donut or heatmap, the automatic type, value labels, legend, title, axis and group labels, the tooltip of the element under the pointer and the chart image.
---

# Charts

**Chart** in the toolbar draws the same report as a chart. **Table** brings the table back.

- The items of Rows are the categories along the axis.
- Each item of Columns and each value is a series.
- The button next to Table and Chart picks the type. It also has the **Display** settings: value
  labels, legend, title and more.

![A line chart of monthly revenue per category](../assets/screenshots/chart-light.png#only-light)
![A line chart of monthly revenue per category](../assets/screenshots/chart-dark.png#only-dark)

## Chart types

| Type | Draws |
| --- | --- |
| **Automatic** | What fits the data, as described below. It is the default until you pick a type. |
| Bars, stacked bars, horizontal bars | A bar per category and series. |
| Lines, area | A line per series. Area fills the space below the line. |
| Pie | A whole circle, one slice per row. |
| Donut | A ring, one slice per row. |
| Heatmap | A grid of rows and columns, coloured by value. |

**Automatic** decides by the data:

- A date on Rows draws **lines**, with the dates along the axis. So does a date grouped along the
  time line by day, week, month, quarter or year, such as "Created by month".
- A grouping that repeats gives categories and draws **bars**: weekday, hour of day, month,
  quarter or week of year.
- When the dates are on Columns only, the chart draws **lines** too. For the chart alone, pivotkit
  swaps rows and columns, so the dates run along the axis and each item of Rows is a line. The
  table keeps its layout, and the view does not change. A click on a point opens its rows as in the
  table.
- Anything else draws **bars**.

The type button shows the type, such as "Automatic" or "Bars". A screen reader hears
"Chart type: Bars". "Automatic" in its menu says what it draws now, such as "Now: Lines". A type you
pick stays.

## Tips the chart gives

| When | The tip |
| --- | --- |
| The chart is over dates, and you picked a type that is not lines, such as bars or a pie | **Show as lines over time** goes back to Automatic. It is one step, and Undo takes it back. |
| A pie or a donut has more than about 7 slices | **Switch to Bars**. |
| A pie has a field on Columns | It adds the columns up into one slice per row. |
| Lines or an area over categories without an order, such as countries or teams | "Lines connect points into a trend. For categories such as countries, bars fit better." with **Switch to Bars**. The tip does not show for dates, number ranges or a custom order such as the seasons. Nor does it show when the dates are on Columns: then the next tip offers to swap. |
| More than 8 series, or lines with the dates on Columns | **Swap rows and columns**. It also shows above the Columns zone. |
| More than 50 categories | The chart draws at most 50, with a note that always shows. |

## Display settings

The chart type menu has its **Display** settings under the chart types, in one flat list. See
[long menus](layout.md#menus-that-are-long).

- Each choice applies at once, and the menu stays open, so the chart behind it shows the change.
- The settings stay with the report: in saved views, links and the chart image. They also stay when
  the chart type changes.
- An **i** next to Labels, Group labels and Tooltip explains them.

![The chart type menu with its Display settings: value labels, legend, title](../assets/screenshots/chart-display-light.png#only-light)
![The chart type menu with its Display settings: value labels, legend, title](../assets/screenshots/chart-display-dark.png#only-dark)

| Setting | Choices | Default |
| --- | --- | --- |
| Value labels | Automatic, Off, Value. A pie and a donut also offer Percent and Value and percent. | Automatic: a pie names its slices. A heatmap writes the numbers while there are 200 cells or fewer. Bars and lines write nothing. |
| Labels (pie and donut) | Outside, Inside. Not offered while value labels are Off. | Outside |
| Legend | Automatic, Bottom, Right, Off | Automatic: above the chart when there is more than one series. A pie and a donut always have one. |
| Title | Any text. The × removes it at once. | none |
| Smooth lines | on, off. Lines and area only. | off |
| Axis labels | Automatic, All (slanted), Every n-th. Bars, lines and areas only. | Automatic |
| Group labels under the axis | Automatic, On, Off. Only with two or more fields in Rows. | Automatic: shown while the chart has room for them |
| Tooltip | Automatic, All series. Bars, lines and areas only. | Automatic: the element under the pointer |

??? info "Pie and donut labels"
    **Outside** writes each slice's name with what is chosen, on a line to the slice. On a narrow
    chart, such as on a phone, the labels get room beside the pie:

    - The pie gets smaller, down to 40 % of its radius.
    - A long label goes on two or more lines, broken at its spaces.
    - If a word still has no room at that size, the labels go on the slices where they fit there,
      as with **Inside**. This needs a legend.

    With a legend, each side of the pie writes as many labels as its height holds, those of the
    larger slices first. A smaller slice can then lose its label on the chart, in the chart image
    and in the HTML report. The legend still names it, and on screen the tooltip does too. With
    the legend **Off**, every slice keeps its label, even where two labels touch.

    ![A donut on a phone: a smaller ring, each region's name and revenue on two lines beside it](../assets/screenshots/donut-phone-light.png#only-light){ width="300" }
    ![A donut on a phone: a smaller ring, each region's name and revenue on two lines beside it](../assets/screenshots/donut-phone-dark.png#only-dark){ width="300" }

    **Inside** writes only the number on the slice, in a colour that reads on it. For Automatic, the
    number is the share. The legend names the slices. A slice narrower than 12 degrees gets no
    label. A low or narrow chart can make the ring of a donut too thin for the numbers. Then the
    chart writes them outside, on a line to their slice.

    A pie writes its share as your language writes percentages: "35.7%" or "35,7 %".

    ![A donut with the numbers on its slices, the chart type menu open at Labels](../assets/screenshots/donut-labels-light.png#only-light)
    ![A donut with the numbers on its slices, the chart type menu open at Labels](../assets/screenshots/donut-labels-dark.png#only-dark)

??? info "Legend and title"
    On a chart narrower than 480 px, such as on a phone, a legend set to **Right** goes to the
    bottom. The pie or the plot keeps its width. A title wider than the chart ends in "…", on screen
    and in the chart image. The chart's name for screen readers includes the title:
    "Chart: Revenue by region".

??? info "Axis labels"
    **Automatic** writes the categories as follows:

    - every category straight when the longest name fits its place
    - slanted by 45 degrees when they would overlap
    - every n-th one, slanted, when not even that fits. A line under the chart then says
      "One label in every 3 is shown".

    **All (slanted)** always writes every label. **Every n-th** keeps them straight and leaves out as
    many as needed. A name longer than 120 px ends in "…", and the tooltip has it whole.

    Slanted names never take more than 40 % of the chart's height, not counting its margins and
    the group labels. In a low chart they end in "…" sooner, so the plot keeps its room.

    Horizontal bars write their names straight, every one while a line fits each bar. The value at
    the end of a horizontal bar keeps its room on the right. On a narrow chart the value axis
    writes fewer numbers, at even steps from 0, so they do not run into each other.

??? info "Heatmap row names"
    A heatmap names every row while each row is at least a pixel higher than the text. In a lower
    chart it names every second row, or every n-th one, so the names never overlap. The tooltip
    names the row of every cell.

??? info "Group labels"
    With two or more fields in Rows, such as Region, then Country, the axis names each category by
    its inner field, the country. It writes the outer field's item, the region, once under its
    categories, with a line between two groups. Horizontal bars put the groups left of the names.

    - **Off** writes the whole path at each category: "Asia / Japan".
    - **Automatic** shows group labels only where they can be read. The chart must be at least 420 x
      260 px, with at least 56 px under the axis for the smallest group. For horizontal bars, it
      needs 28 px beside the axis. In a smaller chart, such as on a phone, the axis writes the whole
      paths instead.
    - **On** always shows them.

    ![Bars of the three largest countries per region, the regions as group labels under the country names](../assets/screenshots/chart-groups-light.png#only-light)
    ![Bars of the three largest countries per region, the regions as group labels under the country names](../assets/screenshots/chart-groups-dark.png#only-dark)

## Read the chart

Point at a bar, a segment of stacked bars or a point of a line to see a tooltip.

- The tooltip names the element under the pointer: the series' colour, its name and the value
  formatted as in the table. Its title is the category's whole name.
- A stacked segment, or a point of a stacked area, adds a **Total** line: the sum of the stack's
  parts. A part below zero counts against it.
- Only sums and counts add up. An average, a median or a maximum gets no total. Neither does a
  value shown as a rank or as a percent difference.
- Between the elements, the tooltip lists every series at that category. So does the fill of an
  area. Between stacked bars, it shows the total only.
- A series without a value at the category is left out.
- A long series name ends in "…". When more series are there than fit, the last line says how many
  more there are, and whether the total includes them.
- On a phone, tap a bar, a point or a heatmap cell to see its tooltip. Tap it again to open the rows
  behind it.
- A pie's tooltip shows the value's name, the slice and its value. With a field on Columns, a slice
  adds up every column.
- A heatmap's tooltip shows the value's name, the cell's row and column and its value.
- The tooltip is plain text: nothing from the data is read as markup.
- A heatmap's colour scale writes its ends in the value's number format.
- Click a bar, a point or a heatmap cell to open the rows behind it, as in the table. See
  [the rows behind a number](drill-down.md).
- The chart has a text alternative for screen readers: type, values, counts, highest and lowest value.

![Stacked bars with the tooltip of one segment: its series, its value and the stack's total](../assets/screenshots/chart-tooltip-light.png#only-light)
![Stacked bars with the tooltip of one segment: its series, its value and the stack's total](../assets/screenshots/chart-tooltip-dark.png#only-dark)

??? info "Every series in the tooltip"
    **Tooltip**, **All series** in the Display settings lists every series at the pointer's category,
    wherever the pointer is. The series under the pointer comes first, its name in bold. Stacked bars
    and areas add the total. The setting stays with the view.

## Save the chart as a picture

**Export**, **Chart image (.png)** saves the chart as it is drawn, at twice the screen's resolution,
on the report's background colour. The picture has the chart's title, legend, value labels and group
labels. While the table is shown, the entry is greyed out and says "Switch to Chart first." See
[export](export.md).

!!! note "For developers"
    [Charts](../concepts/charts.md) describes:

    - the view's `chart` settings
    - what "auto" stands for (`autoChartType`)
    - `chartOptions`: plain JSON merged over the ECharts option, for what the menus do not offer.

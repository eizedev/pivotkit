---
title: Charts
description: Show a pivotkit report as a chart - bars, lines, area, pie, donut, heatmap, bars and lines, or a treemap, the automatic type, value labels, legend, title, axis and group labels, the zoom slider, series shown or hidden, 100 % stacks, reference lines for an average, a trend and a target, high and low points, many slices in one slice "Other", the tooltip of the element under the pointer, fixed colours, the share in the tooltip and the chart image.
---

# Charts

The tab **Chart** on top of the result draws the same report as a chart. The tab **Table** brings
the table back.

- The items of Rows are the categories along the axis.
- Each item of Columns and each value is a series.
- **Chart settings** next to the tabs picks the type. It also has the **Display** settings: value
  labels, legend, title and more.
- With the table shown, the same button reads **Table settings**. It holds the totals, **Expand all**
  and **Collapse all**.

![A line chart of monthly revenue per category](../assets/screenshots/chart-light.png#only-light)
![A line chart of monthly revenue per category](../assets/screenshots/chart-dark.png#only-dark)

## Table and chart side by side { #both }

The tab **Both** shows the table on the left and the chart on the right. It is there on a wide
report: the report itself, field list included, is at least 1,024 pixels wide.

- Drag the line between them to give the table more or less room. With the focus on the line, the
  left and right arrow keys move it, **Home** and **End** to the narrowest and widest table. The line
  stays where you put it while the report is open.
- **Table settings** and **Chart settings** stand side by side, one for each part.
- The chart follows what the table shows: its filters, its sort and its folded groups.
- **Enlarge** and **Full screen** take both parts.
- The export of a picture takes the chart.
- A narrower report, such as a phone, shows the table. Its tabs are **Table** and **Chart**.
- A static HTML report of such a view has the table and the chart.

## Chart types

| Type | Draws |
| --- | --- |
| **Automatic** | What fits the data, as described below. It is the default until you pick a type. |
| Bars, stacked bars, horizontal bars | A bar per category and series. |
| Lines, area | A line per series. Area fills the space below the line. |
| Pie | A whole circle, one slice per row. |
| Donut | A ring, one slice per row. |
| Heatmap | A grid of rows and columns, coloured by value. |
| Bars and lines | The first value as bars, every other value as a line on an axis of its own. See [bars and lines](#bars-and-lines). |
| Treemap | A tile per row, its size the row's total. See [treemap](#treemap). |

**Automatic** decides by the data:

- A date on Rows draws **lines**, with the dates along the axis. So does a date grouped along the
  time line by day, week, month, quarter or year, such as "Created by month".
- A grouping that repeats gives categories and draws **bars**: weekday, hour of day, month,
  quarter or week of year.
- When the dates are on Columns only, the chart draws **lines** too. For the chart alone, pivotkit
  swaps rows and columns, so the dates run along the axis and each item of Rows is a line. The
  table keeps its layout, and the view does not change. Clicking a point opens
  [its menu](#filter-from-the-chart), with its rows as in the table.
- Anything else draws **bars**.

### Bars and lines { #bars-and-lines }

**Bars and lines** shows two values of different sizes in one chart, such as revenue and units.

![Revenue per month as bars on the left axis, units as a line on the right axis](../assets/screenshots/chart-combo-light.png#only-light)
![Revenue per month as bars on the left axis, units as a line on the right axis](../assets/screenshots/chart-combo-dark.png#only-dark)

- The first field in **Values** draws bars on the left axis.
- Every other value draws a line on the right axis.
- Each axis is named after its values, with a small square in its series' colour. On a phone the
  legend names them.
- To swap bars and line, move the other value to the first place in **Values**.
- It needs two fields in **Values**. With one, the type is greyed out and says "Needs two values."
- The two axes have their own scales. Where the bars and the line meet means nothing.
- It draws no reference lines.

### Treemap { #treemap }

**Treemap** shows many parts of a whole. Each row is a tile, and its size is the row's total.

![A treemap of 20 countries by population, each tile named with its value](../assets/screenshots/chart-treemap-light.png#only-light)
![A treemap of 20 countries by population, each tile named with its value](../assets/screenshots/chart-treemap-dark.png#only-dark)

- Each tile shows its name and value in its middle, on a plate in the background's colour. The
  plate looks the same on every tile, whatever the tile's colour.
- A name wider than its tile ends in "…" after at least 4 characters; a value that does not fit is
  left out. A tile with less room, or lower than a line, shows no text. Point at or tap a tile for both.
- A row with a total of 0 or less gets no tile.
- The colours only tell the tiles apart. They do not stand for a value.
- Without a background colour the chart can draw, the text has no plate. It then takes the text or
  background colour, else black or white, that reads on its tile ([Theming](../reference/theming.md#chart-colours)).
- It has no legend. **Chart settings › Series** hides a tile or sets its colour.
- With a field on Columns, a tile adds up every column, as a pie does.
- A click on a tile opens no rows.

The icon of the tab **Chart** shows the type drawn. In **Chart settings**, a screen reader hears the
group of types as "Chart type: Bars". "Automatic" says what it draws now, such as "Now: Lines". A
type you pick stays.

## Tips the chart gives

| When | The tip |
| --- | --- |
| The chart is over dates, and you picked a type that is not lines, such as bars or a pie | **Show as lines over time** goes back to Automatic. It is one step, and Undo takes it back. |
| A pie or a donut has more than about 7 slices | **Switch to Bars**. |
| Stacked bars or areas of an average, a minimum, a maximum or a median | A stack adds up its parts, and that sum is no useful total. **Switch to Bars** shows the parts side by side. The tooltip leaves out the stack's total for such a value. |
| A pie has a field on Columns | It adds the columns up into one slice per row. |
| Lines or an area over categories without an order, such as countries or teams | "Lines connect points into a trend. For categories such as countries, bars fit better." with **Switch to Bars**. The tip does not show for dates, number ranges or a custom order such as the seasons. Nor does it show when the dates are on Columns: then the next tip offers to swap. |
| More than 8 series, or lines with the dates on Columns | **Swap rows and columns**. It also sits in the heading row of the zones. |
| More than 50 categories | The chart draws at most 50, with a note that always shows. |

## Display settings

**Chart settings** lists the chart types first. Below them is one row per topic: Value labels,
Legend, Title, Axis, Tooltip, Reference lines, Series and Layout. Each row shows what is set and opens
a level. **Back**, Escape or the left arrow goes back to the row. A topic the chart has nothing for
is left out: a pie has no Axis, a heatmap no Series.

A choice applies at once, and the menu stays open, so the chart behind it shows the change. The
settings stay with the report: in saved views, links and the chart image. They also stay when the
chart type changes. An **i** explains Group labels, Tooltip, Zoom slider, Series, Stacked to 100 % and the
labels of a pie.

![Chart settings: the chart types, then the rows Value labels, Legend, Title, Axis, Tooltip, Reference lines, Series and Layout](../assets/screenshots/chart-display-light.png#only-light)
![Chart settings: the chart types, then the rows Value labels, Legend, Title, Axis, Tooltip, Reference lines, Series and Layout](../assets/screenshots/chart-display-dark.png#only-dark)

| Setting | Path | Choices | Default |
| --- | --- | --- | --- |
| Value labels | Chart settings › Value labels | Automatic, Off, Value. A pie and a donut also offer Percent and Value and percent. | Automatic: a pie names its slices. A heatmap writes the numbers while there are 200 cells or fewer. Bars and lines write nothing. |
| Legend | Chart settings › Legend | Automatic, Bottom, Right, Off | Automatic: above the chart when there is more than one series. A pie and a donut always have one. |
| Title | Chart settings › Title | Any text. The × removes it at once. | none |
| Axis labels | Chart settings › Axis | Automatic, All (slanted), Every n-th | Automatic |
| Group labels | Chart settings › Axis | Automatic, On, Off. With two or more fields in Rows. | Automatic: shown while the chart has room for them |
| Zoom slider | Chart settings › Axis | Automatic, On, Off | Automatic: more than 20 categories, or an axis that would leave out 3 names or more between two |
| Tooltip | Chart settings › Tooltip | Automatic, All series | Automatic: the element under the pointer |
| Share in the tooltip | Chart settings › Tooltip | on, off. Not for a heatmap. | off |
| Series | Chart settings › Series | A switch per series, or per slice of a pie or a donut, with its colour beside it. One series is listed for its colour. | all shown, in the palette or the colours your app sets |
| Stacked to 100 % | Chart settings › Layout | on, off. Stacked bars and areas of sums and counts. | off |
| Reference lines | Chart settings › Reference lines | Average, Trend, High and low points, Target. Bars, lines and areas. See [below](#reference-lines). | none |
| Smooth lines | Chart settings › Layout | on, off. Lines and areas. | off |
| Labels of a pie | Chart settings › Layout | Outside, Inside. Not while value labels are Off. | Outside |
| Groups of Rows | Chart settings › Layout | **Show each Country**, **Show Region only**, named by the fields. See below. | each item shown |

??? info "Groups of Rows in a chart"
    With two or more fields in Rows, a collapsed group is one category of the chart. Layout names
    both choices by the fields:

    - **Show each Country** shows every item of the last field in Rows. It is the table's
      **Expand all**.
    - **Show Region only** keeps the groups of the first field. It is the table's **Collapse all**.
      In **Table settings**, Collapse all shows the same words beside it.

    Layout's row says how the groups show now: "Each Country", "Region only" or "Some groups
    collapsed", after its other settings.

    With one field in Rows both read **Show details** and **Show group totals only**. They are greyed
    out with the reason "Needs two or more fields in Rows." Either choice closes the menu and is one
    step for Undo.

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
    the legend **Off**, the smallest slices share one slice instead. See
    [many slices](#many-slices).

    ![A donut on a phone: a smaller ring, each region's name and revenue on two lines beside it](../assets/screenshots/donut-phone-light.png#only-light){ width="300" }
    ![A donut on a phone: a smaller ring, each region's name and revenue on two lines beside it](../assets/screenshots/donut-phone-dark.png#only-dark){ width="300" }

    **Inside** writes only the number on the slice, in a colour that reads on it. For Automatic, the
    number is the share. The legend names the slices. A slice narrower than 12 degrees gets no
    label. A low or narrow chart can make the ring of a donut too thin for the numbers. Then the
    chart writes them outside, on a line to their slice.

    A pie writes its share as your language writes percentages: "35.7%" or "35,7 %".

    ![A donut with the numbers on its slices and the region names in the legend above it](../assets/screenshots/donut-labels-light.png#only-light)
    ![A donut with the numbers on its slices and the region names in the legend above it](../assets/screenshots/donut-labels-dark.png#only-dark)

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

## Many slices without a legend { #many-slices }

With the legend **Off**, the labels are the only names of the slices. When they have no room, the
smallest slices go into one grey slice, such as "Other (12)".

![A donut of 20 countries on a phone: the eight largest with their names, the rest as one grey slice "Other (12)"](../assets/screenshots/donut-other-light.png#only-light){ width="300" }
![A donut of 20 countries on a phone: the eight largest with their names, the rest as one grey slice "Other (12)"](../assets/screenshots/donut-other-dark.png#only-dark){ width="300" }

- The number says how many slices it holds. Its size is their sum.
- Point at it, or tap it on a phone, to see each slice it holds with its value, the largest first.
- Every other slice keeps its whole label.
- When even two slices and the grey one have no room, the chart draws every slice with its label, even where two labels touch.
- The rule follows the room. A phone shows fewer slices than a wide screen. The chart image, the
  HTML report and printing follow the same rule at their size.
- The numbers stay the same: the table and the export list every slice.
- To see every slice on the chart, set **Legend** to **Bottom** or **Right**, or show the table.
- A slice you hid in the legend stays hidden. It is not part of the grey slice.

## Zoom and series { #zoom-and-series }

A chart with many categories, such as 40 countries, gets a **zoom slider** under the axis.
Automatic shows it for more than 20 categories. With fewer, it shows it only when the axis would
leave out 3 names or more between two. Horizontal bars get the slider on the right.

The slider first shows as many categories as the axis can name: the latest ones over dates, else
the first ones. Drag it to move along the axis. Drag its ends to show more or fewer categories, up
to all of them. The axis then names its categories again. The chart keeps the slider's place when
it is drawn again, for example in a narrower window. On a touch screen the slider is as thick as a
finger needs.

The slider works by keyboard too. Press Tab until it has the focus ring.

- The left and right arrows move the window by one category.
- Shift with an arrow makes it one category larger or smaller.
- Page Up and Page Down move it by its own width. Home and End go to the first and last categories.
- A screen reader hears what it shows: "Categories 12 to 30 of 40".

Chart settings › Axis › Zoom slider › Off draws every category instead. Then the axis may name only
every n-th one. The chart image, the SVG, the HTML report and a print always show every category.

![Bars of 40 countries on a phone: the zoom slider under the axis, each country in its window named](../assets/screenshots/chart-zoom-light.png#only-light){ width="300" }
![Bars of 40 countries on a phone: the zoom slider under the axis, each country in its window named](../assets/screenshots/chart-zoom-dark.png#only-dark){ width="300" }

Click a series in the legend to hide it. Click it again to show it. A screen reader hears "Software
hidden" or "Software shown". The view keeps it, and **Undo** takes it back. Chart settings › Series has a
switch per series, or per slice of a pie, for the keyboard. It lists every series; a long list
scrolls.

Chart settings › Layout › Stacked to 100 % makes each stack as high as the axis. It is offered for stacked
bars and areas of sums and counts, the values that add up. An area is stacked by it.

- Each part shows its share, in the value labels too. A part of 0 shows "0.0%".
- The tooltip shows a part's value and its share, such as "Hardware 20 33.3%". Its **Total** adds
  the values.
- A hidden series does not count. The other parts share the stack.
- A stack with parts below zero does not fill the axis: its parts above and below zero share the
  100 %, and the axis runs from -100 %. A stack that adds up to nothing gets no bar.

## Reference lines

A reference line compares the values with their average, with their trend over time, or with a
target you set. High and low points mark the highest and the lowest value of each series.

1. Open **Chart settings** next to the tabs **Table** and **Chart**.
2. Open **Reference lines**. Its row says which lines are on, such as "Average, Target".
3. Switch on **Average**, **Trend** or **High and low points**. The level stays open, so you can
   switch more than one.
4. Open **Target**. Its row shows the target, or "No target". Type a number and press Enter, or
   click **Apply**. **Remove the target** or the **×** removes it.
5. **Back** or Escape returns one level.

![Chart settings open at Chart settings › Reference lines: Average and Trend switched on, the Target row with 500000](../assets/screenshots/chart-lines-level-light.png#only-light)
![Chart settings open at Chart settings › Reference lines: Average and Trend switched on, the Target row with 500000](../assets/screenshots/chart-lines-level-dark.png#only-dark)

![A line of monthly revenue with its average dashed, its trend dotted and a target as a solid line](../assets/screenshots/chart-lines-light.png#only-light)
![A line of monthly revenue with its average dashed, its trend dotted and a target as a solid line](../assets/screenshots/chart-lines-dark.png#only-dark)

| Line | Drawn as | Shows |
| --- | --- | --- |
| Average | dashed, in the series' colour | the mean of the series' values in the chart |
| Trend | dotted, in the series' colour | a straight line fitted through the series' values, from its first to its last point |
| Target | solid, in a neutral colour | the number you typed, once for the whole chart |

- Each line has a label right of the plot, at the line's height. It starts with a short sample of
  the line's dash in the line's colour, then the name and the value, written short as on the axis,
  such as "Target 500K". A label of a line close to another moves just below it.
- On a chart narrower than 480 px, such as on a phone, the names stay only where all labels fit in
  30 % of the width. Else a label writes the value (a trend its name) after its dash in the series'
  colour, as in the legend. A label that cannot sit near its line is left out; the tooltip names it.
- The value axis reaches every line. A target higher than every bar still shows.
- The tooltip lists the lines at the category with their whole values: a trend with its value there.
- The chart image, the HTML report and the chart as SVG draw the lines too.
- The lines stay with the report: in saved views, links and the chart image.

### High and low points

**High and low points** marks the highest and lowest value of each series: a dot, ▲ or ▼ and the value.

![A line for each year of monthly temperatures, each year's highest and lowest month marked with a dot and a label with ▲ or ▼ and its value](../assets/screenshots/chart-points-light.png#only-light)
![A line for each year of monthly temperatures, each year's highest and lowest month marked with a dot and a label with ▲ or ▼ and its value](../assets/screenshots/chart-points-dark.png#only-dark)

- The dot has the series' colour. Its label, in the muted text colour (`--pk-muted`), starts with
  ▲ for the highest value or ▼ for the lowest, then the value as the table writes it.
- On a line, the highest label sits above its dot and the lowest below it.
- On bars and areas, both labels sit above the dot. On a bar, that is past the bar's end.
- A label never stretches the axis across zero. Near zero, it sits beside its dot.
- Labels have an outline in the background's colour, so they read over a line.
- A stack marks the highest and lowest total, in the neutral colour of a target.
- Labels that would cover each other or another bar of a group move beside their dots or above
  the group. In dense grouped bars the chart's highest and lowest label come first, and some
  others are left out; the tooltip has the value.
- With more than 8 series, every dot stays, but only the chart's highest and lowest value keep a
  label.
- Where two categories share the highest value, the first one gets the dot. A series whose values
  are all the same gets none.
- The text for screen readers names the highest and lowest value and where it is. With several
  series, it names them for each series.
- The chart image, the HTML report and the chart as SVG draw the points too.

??? info "Which charts draw which line"
    The chart draws a line only where it means something. A line the chart cannot draw is greyed out
    in the menu, with the reason under it.

    - **Pie, donut and heatmap** have no value axis. They draw no lines.
    - **Bars, lines and areas side by side** draw an average, a trend and the high and low points
      for each series.
    - **Stacked bars and areas** draw the lines of the stack's total, the sum of its parts. Only sums
      and counts add up. A stack of averages, medians or maximums gets no lines at all, not even a
      target: the height of such a stack is no total. High and low points follow the same rule.
    - **A stack with a part below zero** has no single total. It gets no average, no trend and no
      high and low points. The target stays.
    - **A trend** needs dates on Rows, such as "Created by month", in date order. Categories such
      as countries have no order of their own, so a line through them would be made up. A sort by
      value takes the date order away too.
    - **A target** needs values in one unit. With a count beside a sum, or two values in different
      formats, no single target fits, so the chart draws none.

    A setting that does not apply stays in the view. When you switch back to a chart that can draw
    the line, it is there again. A target that no longer applies keeps **Remove the target** in the
    menu.
    While the table is shown, the menu offers what the view allows and asks you to show the chart,
    which knows its numbers.

??? info "What the numbers are"
    - pivotkit works out the lines from the categories the chart draws. A chart draws at most 50.
    - The average and the trend leave out a category without a value.
    - The average is the plain mean of the points in the chart. For a value that is itself an
      average, such as the average order per month, the line is the mean of those averages. It does
      not weigh a month by its number of orders.
    - A trend fits a straight line to the points by least squares, over the real time between them.
      A gap of 8 months counts as 8 months, so the line bends where the axis leaves the gap out.
      When a category has no date, such as "(blank)", the trend counts the categories as evenly
      spaced, and the menu says so.
    - The target is a number in the value's own unit. For a value shown as a share in percent,
      type "25%" or the share, 0.25. A plain 25 there means 2,500 %, and the menu warns about it.
      For a value that counts in percent itself, type 25 or "25%". "%" works only for values shown
      in percent.
    - The tooltip and the text for screen readers write the numbers in the value's format. An
      average of whole numbers keeps its decimals.

## Read the chart

Point at a bar, a segment of stacked bars or a point of a line to see a tooltip.

- The tooltip names the element under the pointer: the series' colour, its name and the value
  formatted as in the table. Its title is the category's whole name.
- After the chart is drawn again, such as after a legend click, the next move names the element.
- A stacked segment, or a point of a stacked area, adds a **Total** line: the sum of the stack's
  parts. A part below zero counts against it.
- Only sums and counts add up. An average, a median or a maximum gets no total. Neither does a
  value shown as a rank or as a percent difference.
- Between the elements, the tooltip lists every series at that category. So does the fill of an
  area. Between stacked bars, it shows the total only.
- A series without a value at the category is left out.
- A long series name ends in "…". When more series are there than fit, the last line says how many
  more there are, and whether the total includes them.
- On a phone, tap a bar, a point, a heatmap cell or a treemap tile to see its tooltip. Tap a bar, a
  point or a cell again to open [its menu](#filter-from-the-chart).
- A pie's tooltip shows the value's name, the slice and its value. With a field on Columns, a slice
  adds up every column.
- A heatmap's tooltip shows the value's name, the cell's row and column and its value.
- The tooltip is plain text: nothing from the data is read as markup.
- A heatmap's colour scale writes its ends in the value's number format.
- Click a bar, a point, a slice or a heatmap cell to open [its menu](#filter-from-the-chart).
  Double-click it to open the rows behind it at once, as in the table. See
  [the rows behind a number](drill-down.md).
- The chart has a text alternative for screen readers: type, values, counts, highest and lowest
  value, the reference lines with their values, and each series' high and low points.

![Stacked bars with the tooltip of one segment: its series, its value and the stack's total](../assets/screenshots/chart-tooltip-light.png#only-light)
![Stacked bars with the tooltip of one segment: its series, its value and the stack's total](../assets/screenshots/chart-tooltip-dark.png#only-dark)

### Filter from the chart { #filter-from-the-chart }

Click a bar, a point, a slice or a heatmap cell, and a small menu opens at it:

| Entry | What it does |
| --- | --- |
| **Show the rows** | Opens the rows behind the value, as clicking a value in the table does. A slice adds up every column, so it has no rows of its own. With the drill-down turned off, the entry is there only when the page takes the rows itself. |
| **Only North** | Keeps only that item of the field on the axis. |
| **Without North** | Leaves that item out of the report. |
| **Only Software**, **Without Software** | The same for the series: the item of the field on Columns. |

- Under each filter entry is the name of its field. With two fields on an axis, the entry filters the
  inner field: **Only Software** keeps Software in every region.
- A filter from the menu is the field's pick, as in its [filter](filters.md). The field's chip shows
  it, and **Undo** takes it back. A text rule or a top N on the field stays as it is.
- The menu offers no entry that would leave nothing to show.
- A double click opens the rows at once. A slice has no rows of its own, so a double click on it does
  nothing. A treemap's tile opens no menu.
- The arrow keys move through the menu, Enter picks an entry, and Escape closes it.
- On a phone, the first tap shows the tooltip and the second opens the menu at the bottom.
- Without a mouse, use the table: Enter on a value opens its rows. A field's chip menu has its
  filter.

??? info "The share in the tooltip"
    Chart settings › Tooltip › Share in the tooltip adds each value's share after it, such as
    "Software 30 50.0%". On a 100 % stack the tooltip shows the share anyway.

    - With several series, it is the share of the category's total. A category with only one value
      left, the others empty or hidden, shows no share.
    - With one series, it is the share of the categories drawn.
    - A pie or a donut shows the slice's share of the slices shown.
    - Only sums and counts get a share, on a pie too, and only when no part is below zero.

??? info "Fixed colours"
    In Chart settings › Series, the swatch beside each series or slice shows the colour the chart draws.
    Pick another colour there. A chart of one series lists it too, for its colour. The series keeps
    the colour in every chart of the view, whatever else the chart shows. **Default** gives back the
    colour it had. A colour for a name the chart no longer shows is listed at the end with
    **Remove**.

    A colour you pick is one colour for the light and the dark theme. Your app may set colours for
    names too, one per theme if it likes. A colour you pick wins over those.

??? info "Every series in the tooltip"
    Chart settings › Tooltip › All series lists every series at the pointer's category,
    wherever the pointer is. The series under the pointer comes first, its name in bold. Stacked bars
    and areas add the total. The setting stays with the view.

## Save the chart as a picture

**Export**, **Copy chart image** puts the chart as a picture on the clipboard, to paste into a slide
or a message. **Export**, **Chart image (.png)** saves the chart as it is drawn, at twice the screen's resolution,
on the report's background colour. The picture has the chart's title, legend, value labels and group
labels. While the table is shown, the entry is greyed out and says "Switch to Chart first." See
[export](export.md).

!!! note "For developers"
    [Charts](../concepts/charts.md) describes:

    - the view's `chart` settings
    - what "auto" stands for (`autoChartType`)
    - `colorMap`: a fixed colour per series or slice name for every view, one per theme if you like
      ([fixed colours](../concepts/charts.md#fixed-colours))
    - `chartOptions`: plain JSON merged over the ECharts option, for what the menus do not offer.

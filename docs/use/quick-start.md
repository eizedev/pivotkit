---
title: Quick start
description: Your first pivotkit report in six steps, with a picture of each - rows, values, columns, a filter, the chart, then save or export.
---

# Quick start

You build a report by putting fields into four boxes, the **zones**: **Rows** and **Columns** split the
table, **Values** says what is computed in its cells, **Filters** leaves rows out. These six steps
build "revenue per region and category" from sales data. Follow along in the
[live demo](../demo.md) (Data: Sales, Start: Empty report) or in your own application.

## 1. Open the report

An empty report lists every field of the data on the left and shows three first steps in the middle,
with up to three saved views to start from instead.

![An empty report: the field list on the left, the four empty zones, and "Build your report in three steps" with three saved views to start from](../assets/screenshots/quick-empty-light.png#only-light)
![An empty report: the field list on the left, the four empty zones, and "Build your report in three steps" with three saved views to start from](../assets/screenshots/quick-empty-dark.png#only-dark)

## 2. Put a field into Rows

Drag **Region** from the field list into **Rows**, or click it: a text field goes to Rows. The table
lists the regions, one row each; a tip says what comes next. The grand total row comes with the first
value, since without one it has no number.

![Region in Rows: one row per region, and the tip to add a number to Values](../assets/screenshots/quick-rows-light.png#only-light)
![Region in Rows: one row per region, and the tip to add a number to Values](../assets/screenshots/quick-rows-dark.png#only-dark)

## 3. Put a number into Values

Drag **Revenue** into **Values**, or click it: a number goes to Values and is summed. The column reads
"Sum of Revenue"; its menu (the arrow on the chip) changes the sum to an average or a count, and the
number format. A tip says that a click on a value shows the rows behind it.

![Sum of Revenue per region](../assets/screenshots/quick-values-light.png#only-light)
![Sum of Revenue per region](../assets/screenshots/quick-values-dark.png#only-dark)

## 4. Split the columns

Drag **Category** into **Columns**, or choose "Add to Columns" in its menu (the three dots next to
the field). Each region now has a value per category, with totals at the right and at the bottom.

![Revenue per region and category, with totals](../assets/screenshots/quick-columns-light.png#only-light)
![Revenue per region and category, with totals](../assets/screenshots/quick-columns-dark.png#only-dark)

## 5. Filter

Open the menu of the **Region** chip and choose **Filter**. Untick the regions you do not want, or
click **Only** next to one; each change applies at once. The chip then says how many it keeps ("3 of
5").

![The filter of Region: its values with row counts, a search, Select all, Select none, and the folded Rules](../assets/screenshots/quick-filter-light.png#only-light)
![The filter of Region: its values with row counts, a search, Select all, Select none, and the folded Rules](../assets/screenshots/quick-filter-dark.png#only-dark)

## 6. Switch to the chart

Click **Chart** in the toolbar. The same report is drawn as bars, one colour per category. **Table**
brings the table back.

![The same report as bars, one colour per category](../assets/screenshots/quick-chart-light.png#only-light)
![The same report as bars, one colour per category](../assets/screenshots/quick-chart-dark.png#only-dark)

## Then: save, share or export

- **Undo** takes back any step; **Start over** has **Reset** (back to the start) and **New, empty
  report**.
- **Views**, **Save current view** keeps the report under a name, for you; once you work on a saved
  view, **Save** writes your changes into it with one click. **Share this view** copies a link or
  downloads it as a file ([Views, saving and sharing](views.md)).
- **Export** downloads the table as Excel or CSV, or the chart as a picture, and copies the table into
  a spreadsheet ([Export and copy](export.md)).
- Click any number to see the rows behind it ([The rows behind a number](drill-down.md)).

Next: [Learn with real data](../learn.md) has questions to answer on real public data, and
[Use a report](index.md) lists a page for every task.

---
title: Filters, top N and sorting
description: Leave values out of a pivotkit report - the filter with its values and row counts, quick choices for dates such as "Last 3 months" or "This quarter", rules such as "from 2022", "does not begin with" or "Count of Released > 3", items without a value, the top or bottom N with ties - and sort rows and columns.
---

# Filters, top N and sorting

A filter leaves rows out of the report. Open a field's menu and choose **Filter**. Then:

- for a date, pick a quick choice ("Last 2 years")
- tick the values to keep
- or add rules ("from 2022", "Count of Released is greater than 3")

A field in **Filters** filters the whole report. A field on Rows or Columns filters its own items.
**Top items** keeps the largest (or smallest) N.

The Filter row on the menu's first level says what the filter keeps. Examples: "All", "4 of 12",
"last 2 years (2025; 2026 has no data)", "from 2022", "does not begin with “Service”",
"Sum of Revenue > 1,000". The row has a dot when the field is filtered. The chip says the same
words.

## Filter by values

1. Open the field's menu and choose **Filter**. A chip in **Filters** has the same menu: its Filter
   row, Move to and Remove field.
2. Under **Pick items**, untick the values to leave out, or click **Only** next to a value to keep it
   alone. **Select all** and **Select none** act on what the search finds.
3. Each change applies at once. **‹ Back** or Escape goes back to the menu's first level. Undo
   takes a change back.

![The Filter level of the Region field: the summary card, the values with row counts under Pick items, a search, select all or none, and the folded Rules](../assets/screenshots/filter-light.png#only-light)
![The Filter level of the Region field: the summary card, the values with row counts under Pick items, a search, select all or none, and the folded Rules](../assets/screenshots/filter-dark.png#only-dark)

At the top of the level is a summary card. It stays in view while the rest scrolls. Below it are
three sections that fold: **Quick choices** (dates only), **Pick items** and **Rules**.

| In the Filter level | What it does |
| --- | --- |
| The summary | Says what the table shows of the field and why not the rest. It has **Reset filter**. See [below](#the-summary). |
| Quick choices | Only for a date along the time line: a date field, or a grouping by year, quarter, month, week or day. Open at first. It offers **All**, **This [unit]** and **Last [N] [unit]**. Folded under **More choices** are **Next [N] [unit]**, **Before the last [N] [unit]** and rolling periods. Each choice shows the days it keeps and its rows. See [below](#quick-choices-for-dates). A grouping that combines the years (month of the year, weekday, hour) has **Years combined** instead. |
| Pick items | The values with their row counts, to tick. See **Pick items** below the table. |
| Rules | The rules as sentences that must all be true. See **Rules** below the table. |

**Pick items**

- Its header says what is picked ("3 of 12 picked", "all 12 picked"). **Clear** beside it ticks
  every value again.
- Inside are a search, **Select all**, **Select none** and the values with their row counts.
- The section lists at most 300 values. Below them, "300 of 1,045 values; search to find more" says
  that the search finds the rest.
- The items a quick choice or a rule leaves out are not among them. They stand muted in a folded
  group at the end: "Left out by the rules (24) – their ticks apply again once they go". Their ticks
  are kept, and you can still change them.
- The section is open when the field has no rule and folded once it has one.

**Rules**

- Its header says "No rules" or "● 1 rule". The quick choice does not count as a rule. **Remove**
  beside the header takes the rules off, and the quick choice stays.
- Inside are the rules as sentences that must all be true. See [below](#value-filter). The quick
  choice stands first among them as a line to read: "Quick choice: last 2 years (2025; 2026 has no
  data) – change it above".
- The section is folded while the field has no rule. The first rule or quick choice opens it and
  folds Pick items. When the last one goes, the reverse happens. This repeats every time the field
  goes from none to one and back. A fold by hand wins until the next such change.
- "Change it above" scrolls to the quick choice, unfolds its section and puts the focus on the
  choice that is set.

Details:

- The report remembers the values you left out, not the ones you kept, as Excel does. So a value
  that is new in later data shows up. With every value ticked, the field is not filtered at all.
- The values, the quick choice and the rules all apply together. An item is kept when it is ticked
  and meets every rule. The summary counts what the table shows and says why the rest does not.
- The menu stays where it opened while you move between its levels. A taller level scrolls inside
  the menu instead of moving it to the other side of the chip. The summary stays in view.
- Escape in a text or number field gives back what applies. With nothing to give back, it goes back
  a level.
- A field keeps its filters when it moves between Rows, Columns and Filters. Moved to Values, it
  leaves its filters behind. A field that leaves the report takes its filters and its sort with it.
  It leaves with its **x**, with **Remove field**, or when you drag it back to the field list.
- On a phone the level is a sheet. Only one of Pick items and Rules is open at a time, and a rule's
  controls stack.

![A filtered field's menu: the Filter row says 1 of 5 with its dot](../assets/screenshots/filter-state-light.png#only-light)
![A filtered field's menu: the Filter row says 1 of 5 with its dot](../assets/screenshots/filter-state-dark.png#only-dark)

A chip in **Filters** opens the same Filter level from its menu, with **Move to** and **Remove field**:

![The menu of Released in Filters: the Filter row says last 12 months with its months, then Move to and Remove field](../assets/screenshots/filter-zone-light.png#only-light)
![The menu of Released in Filters: the Filter row says last 12 months with its months, then Move to and Remove field](../assets/screenshots/filter-zone-dark.png#only-dark)

### The summary

- In bold: what the table shows of the field. For example "All 12 months shown",
  "3 of 12 months shown", or "Nothing shown" in red.
- Under it: why the rest does not show, each reason with its count. For example
  "9 left out by your picks", "24 outside last 2 years (2025; 2026 has no data)",
  "11 left out by the rule", "2 left out by the rule on the total".
- With nothing shown: the one reason and the nearest value. For example "No month has a total
  Average of Mean °C that is greater than 25 – the totals go from 13.4 (Jan) to 22.2 (Jul)."
- The small line: the rows ("1,104 of 4,386 rows"), as the line under the result counts them. For a
  date it also gives the data's dates
  ("data Jan 1, 2023 – Dec 31, 2025"). A grouping that combines the years adds "2023–2025 combined"
  or "2025 only".
- A screen reader hears the card as it changes.
- **Reset filter** at the card's right takes the picks, the quick choice and the rules off. Top N
  stays.

### Add a field to Filters from the field list

**Add to Filters** in the menu of a field in the field list opens the field's filter at once. It
shows the field's values and a condition on the names. What you set there is a draft:

- **Apply** puts the field into Filters with what you chose.
- **Cancel** changes nothing.

A field on Rows or Columns moves to Filters on **Apply** and stays where it is on **Cancel**. For a
field already in Filters, **Add to Filters** opens its filter there. In Filters, and when you move
it to Rows or Columns later, the field keeps its filter. Its chip opens the whole Filter level. When
you drag a field into Filters, it lands there at once, with every item kept.

![The filter of Product opened from Add to Filters in the field list: its values with row counts, a search, Select all and Select none, a condition on the names, Cancel and Apply](../assets/screenshots/add-to-filters-light.png#only-light)
![The filter of Product opened from Add to Filters in the field list: its values with row counts, a search, Select all and Select none, a condition on the names, Cancel and Apply](../assets/screenshots/add-to-filters-dark.png#only-dark)

## Quick choices for dates

A date field has quick choices above its values. So does a grouping of a date along the time line,
such as "Date by month" or "Released by year". The quick choices stay right over time: "Last 5 years"
is this year and the four before it, today as well as next year.

Each choice counts in a unit you pick: days, weeks, months, quarters or years. No unit is finer than
the grouping:

- grouped by month: months, quarters and years
- a date itself or a grouping by day: days and weeks too
- grouped by year: years alone, without a choice of unit

| Choice | Keeps |
| --- | --- |
| **All** | Every date. It takes the quick choice away, and the rules stay. The line under it shows the data's first and last date and all rows. |
| **This [unit]** | The dates of the current year, quarter, month, week or day, also those later in it. Only the units whose current period has data are offered. With none, a line names it and why: "This year (2026) is not offered: the data end Dec 31, 2025." |
| **Last [N] [unit]** | The current unit and the N - 1 before it, as whole calendar periods: "Last 3 months" in November is September to November. See **Last [N] [unit]** below the table. |
| **Next [N] [unit]** (More choices) | The current unit and the N - 1 after it. With the current unit left out, the N after it. Use it for EOL dates, licences or planned work. |
| **Before the last [N] [unit]** (More choices) | Every date before the last N units, such as what is older than the last 2 years. |
| **Rolling instead of whole calendar periods** (More choices) | Last, Next and Before count from the moment itself instead of whole periods. Rolling, "Last 3 months" on Nov 12 is Aug 12 to Nov 12. There is no current period then, so its checkbox goes away. If you tick it while All or This is set, it waits for the next counted choice. |

**Last [N] [unit]**

- Type N, from 1 to 500. A larger number says "Enter a whole number up to 500." and changes nothing.
  N applies a moment after you stop typing, or with Enter.
- The words follow the number: "Last 1 year", "Letztes 1 Jahr".
- While Last is set, **Include the current month** under it decides whether the current period
  counts. For other units it reads year, quarter or week, or "Include today". When it is off,
  "Last 3 months" in November is August to October.
- When the current period has no data, the checkbox says so: "Include the current month (Nov 2026
  has no data)". A button under it, **Count back from the latest record (Dec 31, 2025) instead**,
  sets **Counted back from** to the latest record. Then "Last 2 years" are the last two years of the
  data.

![The Filter level of Date by month on the weather data: the summary, the quick choices with the data's share of each and their rows, This year not offered, and Counted back from today or the latest record](../assets/screenshots/filter-dates-light.png#only-light)
![The Filter level of Date by month on the weather data: the summary, the quick choices with the data's share of each and their rows, This year not offered, and Counted back from today or the latest record](../assets/screenshots/filter-dates-dark.png#only-dark)

![More choices of EOL date by month on the end-of-life data, open with Next 2 years set: Next and Before the last with their counts and units, Rolling, and Counted back from](../assets/screenshots/filter-more-light.png#only-light)
![More choices of EOL date by month on the end-of-life data, open with Next 2 years set: Next and Before the last with their counts and units, Rolling, and Counted back from](../assets/screenshots/filter-more-dark.png#only-dark)

- A choice applies at once. So does a unit you pick, which also picks its choice. The counts start
  at the smallest one that reaches the latest record, so a choice keeps something. That is 2 at
  least, since "Last 1 month" is This month. Last keeps its count when you pick another unit, as
  long as that count still reaches the data. Otherwise it takes the smallest count that does.
- Each choice shows the days it keeps and its rows ("2022–2026 · 2,190 rows"). When the data do not
  cover all of those days, it shows the days with data and the ones without:
  "2025 (2026 has no data)". The chip, the summary and the menu's first level say the same. For example:
  "last 2 years (2025; 2026 has no data)", "this quarter (Q4 2026)",
  "last 3 months, current period excluded (Aug 2026–Oct 2026)". A rolling range, Before, and a range
  counted from the first record or a date show their dates.
- When the data have no date after today, a range that holds today does not name the days from
  today on as having no data. They cannot have data yet. On data up to yesterday, "last 4 weeks"
  says "last 4 weeks (Oct 26, 2026–Nov 22, 2026)". Days before today without rows are still named.
  So is a range with no data at all, up to yesterday: "last 1 week (Nov 16, 2026 has no data)".
- A range wholly after today names all its days, such as Next without the current period.
- When some rows carry dates after today, such as end-of-life dates, the level names every day
  without data.
- The checkbox for the current period follows the same rule. On the first day of a month, with data
  up to the day before, it does not say the month has no data.
- **Counted back from** offers:
    - **today**, the default: "last 12 months" means the same next month
    - **the latest record**, for data that end, such as an archive or a closed year
    - **the first record**
    - **a date…**, with a date field of its own

    While the date field holds no whole date, the ranges keep the last one, and the field says so
    ("Enter a whole date; the ranges still count from Jun 30, 2024."). If you leave it that way, it
    shows that date again.

    From the latest record, "Last 12 months" is the twelve months up to it, and "This year" is its
    year. The chip says "last 12 months to Dec 2025".

    **Counted back from** stands under the choices in two cases: the latest record lies before this
    month (or this year, for a grouping by year or quarter), or it is set to something other than
    today. Otherwise it waits among **More choices**. It does not move while the menu is open. The
    view saves the choice, and every relative range of the field counts from it, a rule's range too.

- **More choices** opens with a click or Enter. It opens by itself when the choice set is Next,
  Before or rolling.
- Today is the day in the data's time zone, not your computer's. That is the report's `timeZone`,
  UTC unless the application says otherwise.
- On a grouping, the range goes by the dates themselves. With "Last 18 months" on a grouping by
  year, the oldest year shows only its months in the range.
- The arrow keys move between the choices and apply each, as radio buttons do. Tab goes to a count
  and a unit.
- Undo, or a rule that changes the range, shows in the choices and their counts at once. The
  exception is a count you are typing in. The section folds like the others. Folded, its header
  says the choice.
- A view from elsewhere may hold a range the choices write: next, before, rolling, a quarter, or
  counted from a date. It shows that range as its quick choice, and you change it there. A range in
  hours, an inverted range, or a second range of the same field stands among the rules.

### Years combined

Some groupings put the same period of every year together: month of the year, quarter of the year,
week of the year, day of the week, hour of the day. They have no quick choices, since "This year"
would leave a lone December. Instead, **Years combined** shows one toggle per year in the data, with
two to twelve years. Each toggle shows its rows, and all are on at first.

- Switch a year off, and the table combines the others.
- The summary's small line says which years ("2024–2025 combined", "2025 only"). The chip says the
  years ("2024 to 2025").
- You cannot switch off the last year that is on.

Under the hood this is a rule on the dates (below), not a rule of its own. Rules says "No rules"
and shows it as a line: "Quick choice: 2024–2025 combined". A rule of your own on the same grouping
("is from Jun") stays when you switch a year.

![The Filter level of Date by month of year on the weather data: Years combined with 2023, 2024 and 2025, the summary saying 2023–2025 combined, and the months to pick](../assets/screenshots/filter-cyclic-light.png#only-light)
![The Filter level of Date by month of year on the weather data: Years combined with 2023, 2024 and 2025, the summary saying 2023–2025 combined, and the months to pick](../assets/screenshots/filter-cyclic-dark.png#only-dark)

## Rules { #value-filter }

The last section of the Filter level, **Rules**, holds the rules. They are sentences that must all
be true for an item to stay ("Keep the months for which all of these are true:").

- Add a rule with a button under them. The rule's **×** takes it away at once.
- Each button adds a row of its own, even while the row before is not complete yet.
- Each rule has an **i** that explains what it compares, with an example.
- A line under each rule says what it keeps by itself: "Keeps 7 of 12 months".

| Rule | Example | Offered for |
| --- | --- | --- |
| **Compare** the item itself | "Released by year is from 2022", "Price is between 10 and 20", "Released is in the last 3 months" | Numbers and dates, and their groupings |
| **Compare its total** | "Count of Released is greater than 3" | Every field |
| **Rule on the name** | "The name does not begin with Service" | Text and numbers (the number as the table writes it) |

![The Filter level of Date by month of year with a rule on the total: Average of Mean °C is greater than 25, its explanation open, its line saying it keeps 0 of 12 months with the lowest and the highest total, and the red summary](../assets/screenshots/filter-rules-light.png#only-light)
![The Filter level of Date by month of year with a rule on the total: Average of Mean °C is greater than 25, its explanation open, its line saying it keeps 0 of 12 months with the lowest and the highest total, and the red summary](../assets/screenshots/filter-rules-dark.png#only-dark)

### Compare the item itself

- You type a number and pick a date as a day. A grouping offers its items ("2022", "Mar 2025"):
    - A short list comes in a select.
    - A list of more than twelve comes in a searchable list. A button with the item opens a search
      and the matches with their rows ("12 of 358 match"). The arrow keys move, Enter picks, and
      Escape closes the list and leaves the rule as it is. On a phone the select stays.
- The comparisons of a number: is, is not, is greater than, is at least, is less than, is at most, is
  between, is not between.
- The comparisons of a date: is, is not, is after, is from, is before, is up to, is between, is not
  between, and **is in the last** N years, months or days. **is in the last** is a range like the
  quick choices. The field's first such range is the quick choice, and any other one is a rule.
- A date is compared by its day: "is before Mar 1, 2022" keeps every row of 28 February, whatever its
  time.
- A comparison does not keep an item without a value ("(blank)"), unless the rules keep the blank
  items. See [below](#items-without-a-value). With **is not** and **is not between**, the rule says
  so under it ("Blank items are not kept.").
- The **i** says what the rule compares:
    - a grouping along the time line "compares each month by its place on the time line"
    - one that combines the years "by its place in the year, over all the years combined"
    - a number "the value itself, not its total"
    - a date "by its calendar day"
- The chip says it in short: "from 2022", "2022 to 2024", "≥ 10".
- Emptying a number, a day or the count of **is in the last** takes the rule off. Its row stays and
  says "Applies once it is complete." It applies again with the next value, in its place among the
  rules. A comparison changed to **is between** keeps the rule as it was until the second value is
  there.

### Rule on the name

"The name [does not begin with] [Service]". The comparisons are **is**, **is not**, **contains**,
**does not contain**, **begins with**, **does not begin with**, **ends with** and **does not end
with**.

- The text applies a moment after you stop typing.
- Case and runs of spaces do not matter. "SERVER" matches "Server", and a no-break space matches a
  space. A space at the start or end of the text is left out.
- Emptying the text (or its **×**), or a text of spaces only, takes the rule off a moment later. Its
  row stays and says "Applies once it is complete." It applies again with the next text, in its
  place among the rules and with its **Also keep items without a value**.
- A text field compares its value. Any other field compares the name the table writes ("Mar 2025",
  "1,000").

### Items without a value

A rule keeps the items that meet it. An item without a value ("(blank)") meets none, so the rules
leave it out. **Also keep items without a value (37 rows)** shows under the rules, with the rows of
the blank item. It shows when the field has blank items and at least one rule on its items, or a
quick choice.

- Ticked, every rule on the items keeps the blank item, a rule added later too.
- Unticked, no rule keeps it.

A rule on the total does not change: it compares the blank item's total like any other.

![The rules of Country on the Nobel data: the name does not begin with united, and Also keep items without a value ticked with its 7 rows](../assets/screenshots/filter-blanks-light.png#only-light)
![The rules of Country on the Nobel data: the name does not begin with united, and Also keep items without a value ticked with its 7 rows](../assets/screenshots/filter-blanks-dark.png#only-dark)

To show only the items without a value, use the picks: **Select none** under Pick items, then tick
"(blank)".

### Compare its total

The rule keeps the items whose value meets it, as a sentence: "Region items whose Sum of Revenue is
greater than 2,000,000".

1. Pick the value it compares. A choice appears when the report has several values that give
   numbers, with the first one chosen. With no value in **Values**, the rule compares the
   **Count of rows** and names it so.
2. Pick the comparison: is, is not, is greater than, is at least, is less than, is at most, is
   between, is not between.
3. Type the number, or two for between. It applies a moment after you stop typing, or with Enter.
   Once a number is there, the value and the comparison apply at once. Emptying a number takes the
   rule off. Its row stays and applies again with the next number.

![The Filter level of Region scrolled to its rules: Sum of Revenue is greater than 2,000,000](../assets/screenshots/value-filter-light.png#only-light)
![The Filter level of Region scrolled to its rules: Sum of Revenue is greater than 2,000,000](../assets/screenshots/value-filter-dark.png#only-dark)

- The **i** says what the total is: "The total is the month's Grand Total – the Average of Mean °C
  over all 14 City items and the dates Jan 1, 2023 – Dec 31, 2025, as the Grand Total row shows it –
  not a single cell." The scope names the other fields on Rows and Columns. For a date it also names
  the data's dates.
- The line under the rule says what it keeps. When it keeps nothing, the line gives the totals'
  range, written as the table writes the value: "Keeps 0 of 12 months – the totals go from 13.4
  (Jan) to 22.2 (Jul)". The summary then says the same in red.
- The chip then shows the rule in short: "Sum of Revenue > 1,000". So does the Filter row of the
  menu. When the chip is short of room, its text ends in "…". The whole text is in the chip's
  tooltip and in its name for screen readers.
- The number is compared with the value as it is computed: the sum, the count, the average. It is
  not compared with a "show as" percentage or with what the format shows. For
  "Revenue as % of grand total", 0.25 is no condition on 25 %, and 1000 is a condition on the sum of revenue.
- Between keeps the items from the smaller to the larger number, in whatever order you typed them.
  The chip writes the smaller one first. Nothing changes until both numbers are there.
- Text that is no number says so under the field, and nothing applies. Escape gives back the number
  that applies. Undo takes back each change as one step.
- A rule whose value is no longer among the report's values keeps that value. The rule offers it
  next to the values, chosen.
- With a field above it on the same axis, the rule works within each item of that field, as Top N
  does. The line under the rule and the summary count by the Grand Total over the whole data.

### More about rules

- A new rule applies once it is complete: a number typed, an item picked. Until then it changes
  nothing, and its line says "Applies once it is complete." The new rule scrolls into view.
- A rule's **×** takes it away and puts the focus on the first button that adds one. When the last
  rule goes, the section folds and the focus moves to its header.
- A field takes at most 10 rules.
- The **i** of the rules shows while **Show explanations** (More › Help) is on, as the other
  explanations do.
- The chip shows the quick choice or the first rule on the item or its name. It adds "+1" for each
  further one ("last 2 years (2025; 2026 has no data) +1", "contains “linux”"). The whole list is
  in the chip's tooltip and in its name for screen readers. A rule on the total has its own badge.
- With room for them, the name and every badge show whole. When the chip is short of room, as on a
  phone, a badge in words ends in "…" before the field's name gets shorter. A badge with a number
  ("3 of 4", "Top 5") stays whole.
- Pointing anywhere at a chip shows all of it as a tooltip: the field and everything set on it. The
  tooltip uses the words of the chip's name for screen readers ("Month, filtered 10 of 12, 2025").
- The search of the menu finds:
    - the rules: "rule", "compare its total", and the rule on the name by its words, such as
      "does not begin with"
    - the quick choices with the count you type ("last 3 years"), counted back as the field's range
      is
    - for a grouping by year, a year compared ("from 2022", "up to 2022", "before 2022",
      "after 2022")

    Enter applies a found choice at once. A date field compares days, and its rule editor picks
    them.

- **Remove** beside Rules takes every rule away. The values ticked and the quick choice stay.
  **Reset filter** in the summary takes all three away.
- **Reset filter**, **Clear** and **Remove** are greyed out while they would change nothing. For
  Reset that is when nothing is picked out, no rule and no quick choice is set and all years are on.
  For Remove it is when only a quick choice is set.

## Top N

**Top items** in the same menu opens its level. It offers **Off**, **Top 3**, **Top 5**, **Top 10**,
or **Top N…** with **Top** or **Bottom** and a count of your own. The level also sets the value
it goes by. That is a choice when the report has several values that give numbers, and the first value
is the default.

- While a top is set, **Also show items with the same value as the last one** keeps every item whose
  value equals the last one's.
- Under it, the level says how many items show ("7 items shown"). For a field with another one above
  it on its axis, it says that a group can show more than N.
- A choice applies at once, and the level stays open. A count applies a moment after you stop
  typing, or with Enter.
- The menu's row then says "Top 10 by Sum of Revenue", and the chip shows "Top 10".
- Undo takes back each change as one step.

![The Top items level of Country: Off, Top 3 (checked, the template's), Top 5, Top 10 and Top N…, by Sum of Population, Also show items with the same value as the last one, and the items shown](../assets/screenshots/top-items-light.png#only-light)
![The Top items level of Country: Off, Top 3 (checked, the template's), Top 5, Top 10 and Top N…, by Sum of Population, Also show items with the same value as the last one, and the items shown](../assets/screenshots/top-items-dark.png#only-dark)

- Top N and value filters work within each item of the field above, as in Excel. With Region and
  Country on Rows, "top 3 countries" keeps three countries per region. Totals then add up only the
  items shown, so a region's total is the total of its top three countries.
- A note above the table says what a top N does to totals and percentages ("Country shows the top 5
  only: ..."). It always shows, and you cannot dismiss it.
- Top N keeps exactly N items. At a tie at the cut, it keeps the item that comes first in the data.
  With **Also show items with the same value as the last one**, every tied item stays, as in Excel.
  So "Top 6" may show 7 when the 6th and the 7th have the same value. The checkbox stays ticked when
  you change the count or the value. Off takes it away with the top.

![Above the table: the notice that the top 3 cover these items only, and a tip with its x](../assets/screenshots/tips-light.png#only-light)
![Above the table: the notice that the top 3 cover these items only, and a tip with its x](../assets/screenshots/tips-dark.png#only-dark)

## Numbers in the menus

Type numbers in the menus as the report's language writes them. That holds for the rules, the count
of a quick choice, Top N and number ranges.

- German: "1.000,5" or "1000,5"
- English: "1,000.5"
- Every language reads a plain number with a point ("1000.5").

Anything else is no number. The field says so under it instead of guessing:
"Enter a number, such as 1,234.5."

## Sorting

Click a name in the table's header to sort, or use the sort in the menu of a row or column field.
Both write the same sort, and **Undo** takes it back.

### Sort with a click on a header

| Click on | First click | Next clicks |
| --- | --- | --- |
| A value's name ("Sum of Revenue") | Sorts the innermost field in Rows by it, largest first | Smallest first, then the field's own order again (A to Z, or its custom order) |
| A field's name in Rows ("Region") | Z to A (A to Z is the default) | A to Z, Z to A, ... From a sort by a value or a custom order, the first click gives A to Z. |

- The third click on a value's name goes back to the field's own order: A to Z, or its custom
  order. A Z to A you chose before is not kept.
- The arrow next to the name shows the sort you chose: down for largest first or Z to A, up for
  smallest first or A to Z. Pointing at the name, or the focus on it, shows the arrow of the next
  click. The tooltip says what the click does ("Sort by Sum of Revenue: largest first",
  "Sort Region: Z to A"). On a touch screen a faint arrow marks every name that sorts.
- With a field in Columns, only the value names of the **Grand Total** column sort. The sort goes by
  the whole row, not by one column. Without the grand total column the value names do not sort.
- A value that gives no number to sort by (below) does not sort. Neither does a value's name while
  Rows is empty.
- Only the name is the button, not the whole header cell. You can still drag a name into a zone.
- With the keyboard: **Tab** to the name, then **Enter** or **Space**. A screen reader hears two
  things:
    - the sort on the one header whose sort you chose: "sorted descending", or "sorted other" for a
      field in its own order. The default A to Z is not announced on a header.
    - the new order ("Region sorted: Largest Sum of Revenue first")

### Sort in the field's menu

The first level of a row or column field's menu:

| Entry | Sorts |
| --- | --- |
| A to Z, Z to A side by side (dates: Oldest, Newest) | By the item's label: text in natural order for the language ("Item 2" before "Item 10"), numbers and dates by value. This is the default. Blank sorts last. |
| Largest Sum of Revenue first, Smallest Sum of Revenue first | By a value, with the value's name. Without a value, by the number of rows. Items are sorted within their group. With one value, both entries stand on the first level. With more, the level **Sort by value** holds a pair for each value that gives a number, and its row names the sort in use. |
| Custom order, Custom order, reversed | In an order of its own, such as the seasons in the order of the year. They are in the level **Sort by value**. They are offered when the application gives the field an order or a view brought one. |

- The entry in use is marked: a check mark, or the raised segment of A to Z and Z to A.
- A value gives no number to sort by when it:
    - lists distinct values
    - takes the first or last entry of a text
    - takes the average, median, minimum or maximum of dates

    The menu leaves those out.

- A field with an order of its own is sorted in it as soon as you place it on Rows or Columns.
  Choose A to Z to sort it by label instead, and the report keeps that choice.

!!! note "For developers"
    [Filters, top N and sorting](../concepts/filters.md) describes the view's `filters` (`in`,
    `blank`, `text`, `compare`, `relative`, `value`, `top`) and `sort` (`label`, `value`, `custom`),
    and how a field gets its order (`fieldDefaults.order`).

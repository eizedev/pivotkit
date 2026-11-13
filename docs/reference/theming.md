---
title: Theming
hide:
  - toc
description: Style a pivotkit report with the --pk-* CSS custom properties - colours, sizes, fonts, font weights, corners, focus rings, chart colours - in light and dark, for the React component, the web component and the files it exports.
---

# Theming

Every colour, font, font weight, size, corner, focus ring and duration of the report is a CSS custom
property whose name starts with `--pk-`. Set the ones you want to change; the rest keep their
defaults. There is no other styling interface: no class names to target, no `::part()` names. The
chart, the HTML report, print and the Excel export take the same tokens.

## Light and dark

`theme` (prop or attribute) is `"auto"`, `"light"` or `"dark"`. With `"auto"` the report follows the
nearest `data-theme="light"` or `data-theme="dark"` above it (on `<html>`, or on a shadow root's host),
then the system's `prefers-color-scheme`, and changes with them. The theme the report shows is
`data-pk-theme="light|dark"` on its root (`.pk-root` in React, the element itself for
`<pivot-report>`): read it or style with it, do not set it.

Write your dark colours for `[data-pk-theme="dark"]`, as in the examples below, not for an attribute
of the page such as `html[data-theme="dark"]`: the exports read the light theme
([below](#the-excel-export)) by showing it on the report for that moment, so rules on the page's
attribute would put your dark colours into a workbook or an HTML report.

## In React

The defaults have zero specificity (`:where()`), so a plain rule on `.pk-root`, or on the class you
pass as `className`, overrides them:

```css
/* a host mapping its own theme */
.pk-root {
    --pk-accent: var(--host-primary);
    --pk-radius: 4px;
}
.pk-root[data-pk-theme="dark"] {
    --pk-surface: #101418;
    --pk-text: #e6e6e6;
}
```

## On the web component

The report's styles live in its shadow root: no CSS of the page reaches in and none of the report's
reaches out. The `--pk-*` tokens cross when they are set **on the element**; a token set higher up
(on `body`) does not reach the report, because every token is declared on the element's `:host`.

```css
pivot-report {
    --pk-accent: #0a7d5a;
    --pk-radius: 4px;
    --pk-font: "Inter", sans-serif;
}
pivot-report[data-pk-theme="dark"] {
    --pk-surface: #101418;
}
```

Inherited properties cross every shadow root as usual: the report inherits the font family and size
through the element.

## Tokens

| Token | What | Light | Dark |
| --- | --- | --- | --- |
| `--pk-font` | Font family; unset, the report inherits the page's font. | the page's | the page's |
| `--pk-font-size` | Body text: the host's size, at least 14 px. Other sizes are relative to it. | `max(14px, 1em)` | as light |
| `--pk-weight-normal`<br>`--pk-weight-medium`<br>`--pk-weight-strong`<br>`--pk-weight-bold` | Font weights, the only ones the report uses: plain text inside a bolder part (hints, table cells); a light emphasis (row labels, the Table/Chart switch); titles, field chips and emphasis (buttons, links, chosen options, subtotals, the chart's title and group labels); grand totals and step numbers ([below](#font-weights)) | `400`<br>`500`<br>`600`<br>`700` | as light |
| `--pk-surface`<br>`--pk-surface-2`<br>`--pk-surface-3`<br>`--pk-surface-raised` | Background, panels and zones, hover, popovers | `#ffffff`<br>`#f6f7f9`<br>`#eceff3`<br>`#ffffff` | `#16181d`<br>`#1c1f25`<br>`#262a32`<br>`#22262d` |
| `--pk-text`<br>`--pk-muted` | Text; secondary text, the icon buttons until hovered (×, "i", a field's menu) and an action that would change nothing | `#1a1d23`<br>`#5a6270` | `#e8eaef`<br>`#a3aab7` |
| `--pk-border`<br>`--pk-border-strong`<br>`--pk-grid` | Borders, table lines (`--pk-border-strong` also the line before a subtotal column) | `#dde1e7`<br>`#c3c9d2`<br>`#edf0f3` | `#2f343e`<br>`#454c58`<br>`#23272e` |
| `--pk-input-border` | The edge of a text field, a search and a select in a menu (3:1 against the surfaces) | `#7d8592` | `#737b88` |
| `--pk-accent`<br>`--pk-accent-text`<br>`--pk-accent-soft` | Primary buttons, selection, the text actions of the menus (Back, Reset filter, Clear, Select all, Swap rows and columns), text on the accent, soft highlight | `#2b5fd9`<br>`#ffffff`<br>`#e9effc` | `#84a3ff`<br>`#0d1426`<br>`#232d48` |
| `--pk-drop`<br>`--pk-drop-border` | A zone while something is dragged over it; the dashed edge of a zone (3:1) | `#dfe8fd`<br>`#868e9a` | `#263a6b`<br>`#6f7785` |
| `--pk-rule` | The rule between the groups of a menu (3:1 against the menu: More's groups have no titles) | `#868e9a` | `#6f7785` |
| `--pk-note` | Notes and hints above the result | `#eef3fd` | `#1e2638` |
| `--pk-scale-low`<br>`--pk-scale-mid`<br>`--pk-scale-high` | A colour scale whose view names no colours: low, an optional middle, high. Low and high are the heatmap's colours (`--pk-heat-low`, `--pk-heat-high`), so a theme that sets those colours both; without `--pk-scale-mid` the scale runs straight from low to high. The Excel export writes them as the light theme resolves them ([below](#the-excel-export)) | `var(--pk-heat-low)`<br>not set<br>`var(--pk-heat-high)` | as light (the dark heat colours) |
| `--pk-small`<br>`--pk-target`<br>`--pk-target-touch` | Secondary text, never below 14 px; the smallest hit area of a control; that of a small control (×, "i", a field's menu and grip, a tip's x) on a touch screen (`pointer: coarse`) | `max(14px, 0.93em)`<br>`24px`<br>`44px` | as light |
| `--pk-shadow-sm`<br>`--pk-scrim`<br>`--pk-scrim-light`<br>`--pk-knob` | Chip shadow; behind sheets and the drawer; behind the drill-down; the knob of a switch | see `styles.css` | see `styles.css` |
| `--pk-total`<br>`--pk-total-strong` | Subtotal and grand total rows and columns | `#eef1f5`<br>`#e9edf3` | `#21252d`<br>`#252a33` |
| `--pk-danger`<br>`--pk-danger-soft`<br>`--pk-warn`<br>`--pk-focus` | Remove and errors; the card of a filter that shows nothing; a warning in a line of text (the days of a range without data); the focus ring | `#b42318`<br>`#fdecea`<br>`#8a5a00`<br>`#2b5fd9` | `#ff8b80`<br>`#3a1f1d`<br>`#f3c56b`<br>`#84a3ff` |
| `--pk-radius`<br>`--pk-radius-sm` | Corners of panels and popovers; of buttons, chips and fields | `10px`<br>`7px` | as light |
| `--pk-radius-xs`<br>`--pk-radius-mark`<br>`--pk-radius-icon` | Smaller corners, in step with `--pk-radius-sm` (set that one and these follow): links, a list's options, a column's sort button and keys; small parts inside a chip, a cell or a list (a field's grip, a badge, a filter's value, the fold button of a group in the table); a field's type icon | `calc(var(--pk-radius-sm) * 4 / 7)` (4 px)<br>`calc(var(--pk-radius-sm) * 5 / 7)` (5 px)<br>`calc(var(--pk-radius-sm) * 6 / 7)` (6 px) | as light |
| `--pk-radius-card`<br>`--pk-radius-chart` | The chart's tooltip and the HTML report's chart card; the chart's bars and pie slices (a heatmap's cells three quarters of it) | `8px`<br>`var(--pk-radius-xs)` (4 px) | as light |
| `--pk-font-mono` | The code font of the text field a view's JSON is pasted into | `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` | as light |
| `--pk-chart-title-size` | The chart's title ([below](#chart-colours-and-sizes)) | `max(16px, var(--pk-font-size))` | as light |
| `--pk-focus-width`<br>`--pk-focus-offset`<br>`--pk-glow-width`<br>`--pk-ring-width` | The focus ring's width and its gap to the control (in a list, a cell or a segmented button it sits inside the control, as wide); the soft ring around a focused text field and a zone a field is dragged over; the inset ring of a zone a field is dropped on to remove it (a clickable cell's hover ring is three quarters of it, a file drop's one and a half) | `2px`<br>`2px`<br>`3px`<br>`2px` | as light |
| `--pk-shadow`<br>`--pk-shadow-lg` | Chips and buttons; popovers, drawer, drag preview | see `styles.css` | see `styles.css` |
| `--pk-row-h` | Height of a table row | `2.45em` | as light |
| `--pk-panel-w` | Width of the field list; at most 284 px in the medium layout | `288px` | as light |
| `--pk-rail-w` | Width of the field list collapsed to a rail | `40px` | as light |
| `--pk-duration`<br>`--pk-ease` | Animations; `0ms` with `prefers-reduced-motion: reduce` | `180ms`<br>`cubic-bezier(0.2, 0.8, 0.2, 1)` | as light |
| `--pk-type-string`<br>`--pk-type-number`<br>`--pk-type-date`<br>`--pk-type-boolean` | Field type icons | `#6250d6`<br>`#1a7f5a`<br>`#b5560b`<br>`#a3367a` | `#a99dff`<br>`#5fd3a3`<br>`#f2a65a`<br>`#f08cc6` |
| `--pk-chart-1` ... `--pk-chart-8` | Chart series colours, in this order; read by ECharts | `#2a78d6`<br>`#eb6834`<br>`#1baf7a`<br>`#eda100`<br>`#e87ba4`<br>`#008300`<br>`#6250d6`<br>`#e34948` | `#3987e5`<br>`#d95926`<br>`#199e70`<br>`#c98500`<br>`#d55181`<br>`#008300`<br>`#9085e9`<br>`#e66767` |
| `--pk-heat-low`<br>`--pk-heat-high` | Heatmap scale, and a colour scale in the table whose view names no colours (through `--pk-scale-low` and `--pk-scale-high`) | `#eaf1fb`<br>`#2a78d6` | `#1d2735`<br>`#3987e5` |
| `--pk-layer-z` | The z-index of the layer of menus, sheets and popups, only in a browser without the Popover API ([below](#popovers-above-the-page)) | `50` | as light |

Both themes meet WCAG contrast: 4.5:1 for text, 3:1 for interface colours such as borders, the focus
ring and the dashed edge of a zone. A test (`test/contrast.test.js` of pivotkit-react) checks every
pair of the defaults. When you change colours, keep those ratios.

## Popovers above the page

Menus, the bottom sheets of a narrow report and the "i" popups open in the browser's top layer
(`popover="manual"`, the Popover API): above everything of the page, a navigation drawer or an app
bar with a z-index of 1200 too, and never cut off by a box of the page that clips. They stay inside the
report in the DOM, so the tokens above and the theme reach them, also inside the web component's
shadow root, and they are placed against the window.

A description shown while the pointer rests on an "i" outside a menu (the field list, the zones, a
chip) stays in the report's own layer (stacked by `--pk-layer-z`): in WebKit a pointer that moved from the "i" onto it in the top
layer closed it, so its link could not be reached. An "i" inside a menu (Export, Options, Views, a
field's menu) shows its description in the top layer, after the menu, so it is drawn above the menu;
next to the window's edge it moves to stay whole in the window. A click or tap on any "i" opens it in
the top layer.

A browser without the Popover API (Chrome before 114, Firefox before 125, Safari before 17) opens
them in the report's own layer, stacked by `--pk-layer-z` (default `50`). A page whose fixed parts
have a higher z-index raises it:

```css
.pk-root { --pk-layer-z: 1300; }   /* pivotkit-react */
pivot-report { --pk-layer-z: 1300; }   /* the web component */
```

It lifts the layer only as far as the report's stacking context reaches: an ancestor of the report
with a `z-index`, a `transform` or an `opacity` below 1 keeps it inside.

## Font weights

A brand font can look heavier or lighter than the system font at the same weight. The four weight
tokens are a scale: set the steps your font needs, and every part of the report that uses a step
follows, the chart's title and group labels too (the chart reads `--pk-weight-strong` as a number from 1 to
1000; a keyword such as `bold` leaves the chart at 600).

```css
/* a brand font whose semibold looks too heavy */
.pk-root {
    --pk-font: "Brand Sans", sans-serif;
    --pk-weight-strong: 550;
    --pk-weight-bold: 650;
}
```

The same declarations go on `pivot-report` for the web component. The HTML report and print
(Export) take the report's weights along, in either theme, with the light theme's colours (also from a
dark report, as the [Excel export](#the-excel-export) does), the chart card's corner and the chart's
title size. A weight the font has no face for
is drawn with another face: above 500 the browser takes the next heavier one, so with a font of only
400 and 700 a weight of 550 is drawn at 700. Pick weights the font has, or use a variable font.

## Sizes and motion

- Text is never smaller than 14 px, whatever the page's font size (`--pk-font-size`, `--pk-small`).
- Every control is at least 24 x 24 px (`--pk-target`); on a touch screen the small ones at least 44 x 44 px (`--pk-target-touch`). In the field list the grip, the "i" and the menu keep their size and get a hit area `--pk-target-touch` high instead (a layer over them; the grip's as wide too), with the gap between rows grown to hold it, so the rows stay compact.
- Animations run through `--pk-duration`, which is `0ms` when the system asks for reduced motion.

## Chart colours and sizes

The chart reads `--pk-chart-1` to `--pk-chart-8` for its series, in this order, and
`--pk-heat-low`/`--pk-heat-high` for the heatmap, in the current theme. Its title is
`--pk-chart-title-size` large and `--pk-weight-strong` bold; its bars and pie slices have
`--pk-radius-chart` corners, its tooltip `--pk-radius-card` ones. The report resolves the title's
size and the marks' corners to px where it is, so `1.25em` or `calc(var(--pk-font-size) * 1.2)` work
as well as `20px`.

```css
/* a brand with square corners and a larger chart title */
.pk-root {
    --pk-radius: 2px;
    --pk-radius-sm: 0px;      /* --pk-radius-xs, -mark, -icon and the chart's marks follow */
    --pk-radius-card: 2px;
    --pk-chart-title-size: 1.25em;
    --pk-font-mono: "JetBrains Mono", monospace;
    --pk-focus-width: 3px;
}
```

With pivotkit-core alone, pass the colours and the title's size (`titleSize`, px) as `theme` to
[`toEChartsOption`](core.md#output); pivotkit-report takes the tokens as `tokens`, the title's size
and the marks' corners in px.

## The Excel export

A colour scale or data bars whose view names no colours go into the workbook in the theme's colours,
as the report resolves its tokens: the colour scale from `--pk-scale-low`, `--pk-scale-mid` (when set)
and `--pk-scale-high`, low first, and the data bars from `--pk-chart-1`. A theme of your own
carries over into the workbook that way. A view's own colours are written as they are.

The workbook always gets the light theme's colours, since a spreadsheet shows them behind black
text: from a report shown in the dark theme it gets the colours your light theme sets. The report
shows its light theme for the moment it reads them, in the same task, so nothing is drawn and no
transition starts (on `pivot-report` too, where the element shows it). Your dark rules stay out when
they are written for `[data-pk-theme="dark"]` ([above](#light-and-dark)). A token that the browser
cannot write as an sRGB colour (`oklch()` outside sRGB, say) keeps pivotkit-core's default
(`DEFAULT_THEME`, the default light theme's: light blue to blue, and blue bars). The report itself shows a colour
scale lighter than the workbook (mixed with the background, so the numbers stay readable); the
workbook has Excel's full colours. With pivotkit-core alone, pass the colours as `theme` to
[`toXlsx`](core.md#output).

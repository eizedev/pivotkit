---
title: Theming
description: Style a pivotkit report with the --pk-* CSS custom properties - colours, sizes, fonts, chart colours - in light and dark, for the React component and the web component.
---

# Theming

Every colour, size and duration of the report is a CSS custom property whose name starts with
`--pk-`. Set the ones you want to change; the rest keep their defaults. There is no other styling
interface: no class names to target, no `::part()` names.

## Light and dark

`theme` (prop or attribute) is `"auto"`, `"light"` or `"dark"`. With `"auto"` the report follows the
nearest `data-theme="light"` or `data-theme="dark"` above it (on `<html>`, or on a shadow root's host),
then the system's `prefers-color-scheme`, and changes with them. The theme the report shows is
`data-pk-theme="light|dark"` on its root (`.pk-root` in React, the element itself for
`<pivot-report>`): read it or style with it, do not set it.

## In React

The defaults have zero specificity (`:where()`), so a plain rule on `.pk-root`, or on the class you
pass as `className`, overrides them:

```css
/* a host mapping its own theme */
.pk-root {
    --pk-accent: var(--host-primary);
    --pk-radius: 4px;
}
html[data-theme="dark"] .pk-root {
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
| `--pk-surface`, `--pk-surface-2`, `--pk-surface-3`, `--pk-surface-raised` | Background, panels and zones, hover, popovers | `#ffffff`, `#f6f7f9`, `#eceff3`, `#ffffff` | `#16181d`, `#1c1f25`, `#262a32`, `#22262d` |
| `--pk-text`, `--pk-muted` | Text, secondary text | `#1a1d23`, `#5a6270` | `#e8eaef`, `#a3aab7` |
| `--pk-border`, `--pk-border-strong`, `--pk-grid` | Borders, table lines | `#dde1e7`, `#c3c9d2`, `#edf0f3` | `#2f343e`, `#454c58`, `#23272e` |
| `--pk-accent`, `--pk-accent-text`, `--pk-accent-soft` | Primary buttons, selection, text on the accent, soft highlight | `#2b5fd9`, `#ffffff`, `#e9effc` | `#84a3ff`, `#0d1426`, `#232d48` |
| `--pk-drop`, `--pk-drop-border` | A zone while something is dragged over it; the dashed edge of a zone (3:1) | `#dfe8fd`, `#868e9a` | `#263a6b`, `#6f7785` |
| `--pk-note` | Notes and hints above the result | `#eef3fd` | `#1e2638` |
| `--pk-scale-low`, `--pk-scale-mid`, `--pk-scale-high` | A colour scale whose view names no colours | `#f8696b`, `#ffeb84`, `#63be7b` | `#c2413f`, `#b39a2e`, `#3f9a5c` |
| `--pk-small`, `--pk-target` | Secondary text, never below 14 px; the smallest hit area of a control | `max(14px, 0.93em)`, `24px` | as light |
| `--pk-shadow-sm`, `--pk-scrim`, `--pk-scrim-light`, `--pk-knob` | Chip shadow; behind sheets and the drawer; behind the drill-down; the knob of a switch | see `styles.css` | see `styles.css` |
| `--pk-total`, `--pk-total-strong` | Subtotal and grand total rows | `#f4f6f9`, `#e9edf3` | `#1d2128`, `#252a33` |
| `--pk-danger`, `--pk-focus` | Remove and errors; the focus ring | `#b42318`, `#2b5fd9` | `#ff8b80`, `#84a3ff` |
| `--pk-radius`, `--pk-radius-sm` | Corners of panels, of buttons and chips | `10px`, `7px` | as light |
| `--pk-shadow`, `--pk-shadow-lg` | Chips and buttons; popovers, drawer, drag preview | see `styles.css` | see `styles.css` |
| `--pk-row-h` | Height of a table row | `2.45em` | as light |
| `--pk-panel-w` | Width of the field list; at most 244 px in the medium layout | `268px` | as light |
| `--pk-duration`, `--pk-ease` | Animations; `0ms` with `prefers-reduced-motion: reduce` | `180ms`, `cubic-bezier(0.2, 0.8, 0.2, 1)` | as light |
| `--pk-type-string`, `--pk-type-number`, `--pk-type-date`, `--pk-type-boolean` | Field type icons | `#6250d6`, `#1a7f5a`, `#b5560b`, `#a3367a` | `#a99dff`, `#5fd3a3`, `#f2a65a`, `#f08cc6` |
| `--pk-chart-1` ... `--pk-chart-8` | Chart series colours, in this order; read by ECharts | `#2a78d6`, `#eb6834`, `#1baf7a`, `#eda100`, `#e87ba4`, `#008300`, `#6250d6`, `#e34948` | `#3987e5`, `#d95926`, `#199e70`, `#c98500`, `#d55181`, `#008300`, `#9085e9`, `#e66767` |
| `--pk-heat-low`, `--pk-heat-high` | Heatmap scale | `#eaf1fb`, `#2a78d6` | `#1d2735`, `#3987e5` |

Both themes meet WCAG contrast: 4.5:1 for text, 3:1 for interface colours such as borders, the focus
ring and the dashed edge of a zone. A test checks every pair of the defaults. When you change
colours, keep those ratios.

## Sizes and motion

- Text is never smaller than 14 px, whatever the page's font size (`--pk-font-size`, `--pk-small`).
- Every control is at least 24 x 24 px (`--pk-target`).
- Animations run through `--pk-duration`, which is `0ms` when the system asks for reduced motion.

## Chart colours

The chart reads `--pk-chart-1` to `--pk-chart-8` for its series, in this order, and
`--pk-heat-low`/`--pk-heat-high` for the heatmap, in the current theme. With pivotkit-core alone, pass
the colours as `theme` to [`toEChartsOption`](core.md#output).

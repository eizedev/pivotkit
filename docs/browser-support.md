---
title: Browser support
description: Which browsers, React versions and Node versions pivotkit supports and tests.
---

# Browser support

## Browsers

The packages target **ES2022** and these browsers or newer:

| Browser | From |
| --- | --- |
| Chrome, Edge and other Chromium browsers | 111 |
| Firefox | 113 |
| Safari | 16.4 |

Older browsers are not supported.

Every browser test runs in Chromium, Firefox and WebKit from Playwright. WebKit is the engine of
Safari. In the Safari app itself, printing was checked by hand: in Safari 27 on macOS and on iOS 27.2
in the simulator, the table and the chart print. Safari has its own rule, seen in Safari 27 on macOS
and iOS: after you cancel a print dialog, the next print asks first. Printing in the click does not
change that.

Not yet checked in the Safari app:

- whether the hidden print frame is removed after a print
  ([#210](https://github.com/eizedev/pivotkit/issues/210))
- the HTML report on a dark screen and as a PDF
  ([#370](https://github.com/eizedev/pivotkit/issues/370))

Everything else in the Safari app and on iOS is tested through Playwright's WebKit only.

The report relies on these browser features, among others:

- ES modules
- container queries: the layout follows the report's own width
- `Intl` for numbers, dates and plural rules
- for the web component: custom elements, shadow DOM and constructable stylesheets, with a `<style>`
  fallback

Menus, bottom sheets and popups use the Popover API where the browser has it: Chrome and Edge 114,
Firefox 125, Safari 17 or newer. They then open in the browser's top layer, above everything on the
page, whatever z-index the page's own fixed parts have. In an older browser they open in the report's
own layer, stacked by `--pk-layer-z`. A page with a fixed navigation above z-index 50 raises it. See
[theming](reference/theming.md#popovers-above-the-page).

## React

pivotkit-react supports React **18.2 and later, and React 19** (`>=18.2 <20`). The browser tests run on
React 18 and on React 19. pivotkit-element brings its own React 18.3.1. It works on pages without
React and on pages with a React of their own. The tests cover pages with React 18 and 19.

## ECharts

pivotkit-react needs Apache ECharts **6.1 or later 6.x** as a peer dependency (`>=6.1.0 <7`). It loads
ECharts on the first chart. pivotkit-element bundles the parts of ECharts it uses.

## Node

pivotkit-core runs in **Node 22 or later**. CI tests Node 22 and 24. The engine's sources use only what
browsers and Node share, without `process` or `Buffer`, so the same code runs in both. The browser
tests run it in Chromium, Firefox and WebKit through pivotkit-react.

## Phones and touch

The report adapts to its own width. Below 640 px the field list is a drawer, and menus open as sheets
from the bottom. Drag and drop works with a pointer. Every action is also in a menu, so a touch screen
that does not drag well loses nothing. The browser tests check the narrow layout in windows 390 px and
340 px wide, with a mouse. Real phones and touch input are not tested.

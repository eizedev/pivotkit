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

Older browsers are not supported. Every browser test runs in Chromium, Firefox and WebKit (the engine of
Safari) from Playwright; the Safari app itself and iOS are not tested.

Features it relies on include ES modules, container queries (its layout follows its own width), `Intl` for numbers, dates and plural rules, and for the web component custom
elements, shadow DOM and constructable stylesheets (with a `<style>` fallback).

## React

pivotkit-react supports React **18.2 and later, and React 19** (`>=18.2 <20`). The browser tests run on
React 18 and on React 19. pivotkit-element brings its own React 18.3.1 and works on pages without
React and on pages with a React of their own (tested with React 18 and 19).

## ECharts

pivotkit-react needs Apache ECharts **6.1 or later 6.x** as a peer dependency (`>=6.1.0 <7`), loaded
on the first chart. pivotkit-element bundles the parts it uses.

## Node

pivotkit-core runs in **Node 22 or later**; CI tests Node 22 and 24. The engine's sources use only what
browsers and Node share (no `process`, no `Buffer`), so the same code runs in both.

## Phones and touch

The report adapts to its own width: below 640 px the field list is a drawer and menus open as sheets
from the bottom. Drag and drop works with a pointer; every action is also in a menu, so a touch screen
that does not drag well loses nothing. The browser tests check the narrow layout at
390 px and 340 px wide windows, with a mouse; real phones and touch input are not tested.

# Accessibility

I want everyone who builds or reads a pivotkit report to be able to use it with a keyboard, a screen
reader, a touch screen or zoom. A barrier in the report is a bug.

## What the report offers

- Every action has a button or a menu entry, so drag and drop is never the only way.
- Fields, menus, chips and the table work with the keyboard. Moving a chip is announced.
- Controls have names, and status messages reach screen readers.
- The chart has a text alternative: type, values, counts, highest and lowest value.
- Both default themes meet WCAG contrast ratios for text and interface colours.
- Reduced motion switches the animations off.

[Keyboard and screen readers](https://pivotkit.eize.dev/use/keyboard/) has the keys, what a screen
reader hears and where the focus goes.

## How it is checked

- The browser tests drive the report with the keyboard and check focus, names and announcements in
  Chromium, Firefox and WebKit.
- A unit test checks the contrast of every colour pair of the default themes.

pivotkit claims no WCAG conformance level. A theme or colours a host sets itself are not checked.

## Supported environments

The browsers, React and Node versions in
[Browser support](https://pivotkit.eize.dev/browser-support/).

## Known limitations

- The chart's points are not a keyboard stop. Their menu opens only with a pointer. With the
  keyboard, the same rows and filters are in the table and the chip menus
  ([#698](https://github.com/eizedev/pivotkit/issues/698)).
- Not every control has a 44 px touch target on a phone yet
  ([#72](https://github.com/eizedev/pivotkit/issues/72)).

Open work is under the
[`accessibility` label](https://github.com/eizedev/pivotkit/issues?q=is%3Aissue+is%3Aopen+label%3Aaccessibility).

## Report a barrier

Open an [accessibility issue](https://github.com/eizedev/pivotkit/issues/new?template=accessibility.yml).
Say what you tried to do, what happened, and which browser and assistive technology you used.
You do not need to tell me anything about yourself. Leave out real data.

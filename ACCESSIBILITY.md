# Accessibility

I want everyone who builds or reads a pivotkit report to be able to use it with a keyboard, a screen
reader or a touch screen. A barrier in the report is a bug.

## What the report offers

- Every action has a button or a menu entry, so drag and drop is never the only way.
- The field list, the menus, the field chips and the table work with the keyboard.
- Controls have names, and moves and status messages are announced.
- The chart has a text alternative with its numbers.
- The default colours have a contrast of 4.5:1 for text and 3:1 for borders and the focus ring.
- Reduced motion switches the animations off.

[Keyboard and screen readers](https://pivotkit.eize.dev/use/keyboard/) has the details.

## How it is checked

- The browser tests check focus, accessible names, the text of announcements and a size of at least
  24 by 24 px for every control, in Chromium, Firefox and WebKit, in wide and narrow windows.
- A unit test checks a fixed list of text and interface colour pairs of both default themes.
- No test runs with a real screen reader or on a real phone.

pivotkit claims no WCAG conformance level. Colours or a theme that a host sets are not checked.

## Supported environments

The browsers, React and Node versions in
[Browser support](https://pivotkit.eize.dev/browser-support/).

## Known limitations

- You cannot reach the chart's points with Tab, so their menu needs a pointer. The table and the
  field chips' menus offer the same rows and filters
  ([#698](https://github.com/eizedev/pivotkit/issues/698)).
- The chart's series differ by colour alone, without patterns. The text alternative and the table
  have the same numbers.
- On a phone, the row with the loaded view's name may be smaller than 44 px
  ([#72](https://github.com/eizedev/pivotkit/issues/72)).

Open work has the
[`accessibility` label](https://github.com/eizedev/pivotkit/issues?q=is%3Aissue+is%3Aopen+label%3Aaccessibility).

## Report a barrier

Open an [accessibility issue](https://github.com/eizedev/pivotkit/issues/new?template=accessibility.yml).
Say what you tried to do, what happened, and which browser and assistive technology you used.
You do not need to tell me anything about yourself. Leave out real data.

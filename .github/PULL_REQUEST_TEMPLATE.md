## Summary

<!-- What changes and why. Link the issue: Fixes #n / Refs #n. If an AI assistant helped, you may say so; it does not change the review. -->

## Whole-change check

<!--
Needed when the pull request changes docs or code; CI checks for it. Write your answers below this comment.

Docs: each page you touched, read whole and rendered.
- Its reader, and the task they come with.
- Does the reader find what to do in 30 seconds? Is the order by importance? Is every paragraph worth their time?
- How you reshaped it: detail moved to a sub-page and linked, shortened with the full version elsewhere,
  a list or table instead of prose, a section moved where it belongs.
- What you removed or moved, item by item, and where it went.

Code: each function or file you touched, read whole.
- Its job now. One job each; a second job is a split.
- What you extracted or reused.
- Why the rest fits as it is.

A growth guard that fails: the entry, and why the growth is right.
-->

## Checklist ([PRODUCT.md](https://github.com/eizedev/pivotkit/blob/main/PRODUCT.md#what-a-contribution-delivers))

- [ ] Linked issue; for a new feature, the answers to the five questions
- [ ] New or changed tests fail without this change; no test weakened
- [ ] Docs and upgrading notes describe the new state; `CHANGELOG.md` entry (optional)
- [ ] Reviewed before opening by someone who did not write it (strongly recommended, mandatory for the maintainer's own AI agents; for AI-written code a person or a separate AI session), and I read, ran and understand all of it

## Test plan

- [ ] The checks of [Check your change](https://github.com/eizedev/pivotkit/blob/main/CONTRIBUTING.md#check-your-change): those for every change, and those for what this one changes
- [ ] `npm run growth` passes, or the known baseline entry it fails on is named in the whole-change check
- [ ] What I ran, with numbers where a check gives some, such as benchmark timings:

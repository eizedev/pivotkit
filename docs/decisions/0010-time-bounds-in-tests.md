---
title: CPU time for work, wall time only for waits, in tests
description: Tests bound computed work by CPU time. Wall-time bounds stay for event latency, each with a marker.
status: accepted
date: 2026-11-16
---

# 0010 CPU time for work, wall time only for waits, in tests

Sources: [#436](https://github.com/eizedev/pivotkit/issues/436),
[#532](https://github.com/eizedev/pivotkit/pull/532)

## Context and Problem Statement

Some tests check that work finishes within a time, for example that the code handles hostile
input in linear time. They measured wall time. When all workspace suites ran at once on a busy machine, they
failed now and then. The code under test worked. The process only waited for a core.

## Considered Options

- Loosen the bounds.
- Ratio bounds, or interleaved best-of-N rounds.
- Bound work by CPU time, and keep wall time only for what CPU time cannot measure.

#436 named the first two. #532 built the third.

## Decision Outcome

Chosen option: CPU time for work, wall time only for waits.

- CPU time bounds the work the test process computes: `cpuClock()` from `tests/cpu-time.js`.
- Event latency stays on wall time: a timer, the network, a child process. CPU time misses waits.
- So do a timestamp the code wrote, a polling deadline and a ratio of two measurements.
- Such a wall-time line ends in the comment `// wall time: <why>`.
- `tests/time-bounds.test.js` fails on a wall-clock reading in a comparison without that comment.

The reason recorded in #532: wall time grows when other suites share the machine. CPU time does not.
Each converted bound must still fail on its defect.

### Consequences

- Good: bounds keep their old values and stop failing under load.
- Bad: a wall-time bound needs a written reason.

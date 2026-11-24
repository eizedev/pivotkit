// The day the playground's data snapshots were fetched, at noon UTC: one place for the browser specs
// (tests/browser/fixtures.js) and the docs' screenshots (scripts/docs-screenshots.js). A page that
// compares the data with "today" (This year, Last N months) sets the browser's clock to it, so it
// gives the same answer and the same picture in any year; every snapshot of
// examples/playground/data/ names the same day.
import { readFileSync } from "node:fs";

export const SNAPSHOT_DAY = new Date(`${JSON.parse(readFileSync(new URL("../examples/playground/data/endoflife.json", import.meta.url), "utf8")).fetched}T12:00:00Z`);

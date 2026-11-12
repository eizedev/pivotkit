// The documentation site's address, read from zensical.toml (`site_url`), so it is defined once.
import { readFileSync } from "node:fs";

/** @returns {string} the site's address without a trailing slash, e.g. "https://pivotkit.eize.dev" */
export function siteUrl() {
    const config = readFileSync(new URL("../zensical.toml", import.meta.url), "utf8");
    const match = config.match(/^site_url\s*=\s*"([^"]+)"/m);
    if (!match) throw new Error("zensical.toml has no site_url");
    return match[1].replace(/\/$/, "");
}

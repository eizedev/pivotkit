// Whether the module at `url` is the script Node was started with (`node <script>`), for the scripts
// of this repository that can also be imported. Node resolves symlinks in the module's path and
// percent-encodes its URL; process.argv[1] is the path as typed, made absolute. Comparing them as
// they are fails for a checkout under a path with a space or reached through a symlink, and the
// script then does nothing and exits 0 (#312), so both sides are compared as real paths.
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * @param {string} url  the caller's `import.meta.url`
 * @returns {boolean}
 */
export function isMain(url) {
    const started = process.argv[1];
    if (!started) return false;
    try {
        return realpathSync(started) === realpathSync(fileURLToPath(url));
    } catch {
        // the started path no longer exists, or Node was given it without its extension
        return false;
    }
}

// Waiting for a condition in a test, instead of a fixed sleep. A fixed sleep is too short on a busy
// machine and too long on an idle one: the test fails at random, or wastes the time on every run.
// until() asks again every few milliseconds and goes on as soon as the condition holds. It counts its
// tries, not the clock, so a slow machine gets as many tries as a fast one.

/**
 * Waits until `condition` returns a truthy value (not 0, "" or null), and returns that value. A condition
 * that hangs (a request that never answers) is not cut off: give such a request its own time limit.
 * Throws `message` after
 * `tries` tries `every` ms apart (by default 500 tries 10 ms apart, about five seconds when idle).
 * @template T
 * @param {() => T | Promise<T>} condition
 * @param {{ message?: string, tries?: number, every?: number }} [options]
 * @returns {Promise<T>}
 */
export async function until(condition, { message = "the condition did not hold", tries = 500, every = 10 } = {}) {
    for (let i = 0; i < tries; i++) {
        const value = await condition();
        if (value) {
            return value;
        }
        await new Promise((resolve) => setTimeout(resolve, every));
    }
    throw new Error(`${message} (after ${tries} tries ${every} ms apart)`);
}

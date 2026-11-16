// CPU time for tests that bound how long work takes. A wall-clock bound fails when other processes
// share the machine (test suites run in parallel, a busy CI runner): the process waits for a core,
// and its wall time grows while its work does not. CPU time counts only what this process ran.
// It counts every thread of the process (worker threads and the garbage collector's too), so a
// runaway loop in any of them still breaks the bound. The collector's threads can push it above the
// wall time: limits.test.js measured 734 ms of CPU in 405 ms on an idle machine. It does not count child processes, or time
// spent waiting for a timer, the network or another process: bound only work this process computes.

/**
 * Starts a clock of this process's CPU time.
 * @returns {() => number} the CPU time used since the start, in ms
 */
export function cpuClock() {
    const start = process.cpuUsage();
    return () => {
        const used = process.cpuUsage(start);
        return (used.user + used.system) / 1000;
    };
}

// A compute worker that never keeps a table: it answers every job with "need" (compute.js must
// give up after sending the table once).
import { parentPort } from "node:worker_threads";

parentPort?.on("message", (job) => parentPort.postMessage({ id: job.id, need: true }));
parentPort?.postMessage({ ready: true });

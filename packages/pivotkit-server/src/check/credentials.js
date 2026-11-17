/*
 * check-config's section for the secrets the server makes where they are missing (state.js): the
 * state directory (there? writable? on a volume?), and per token or key where it comes from, whether
 * it is there, made at the first start, or cannot be made, and how to read the token. Nothing is
 * made here and no value is read.
 *
 *   Credentials: state directory /var/lib/pivotkit (writable)
 *     the token "admin" (default of the state directory): /var/lib/pivotkit/secrets/admin.token, made at the first start
 *     the download links' key (default of the state directory): /var/lib/pivotkit/secrets/downloads.key, there
 *     read the token with: docker exec 3f2a1b pivotkit-server token show admin
 *
 * check/index.js says what a section returns.
 */

import { access, constants, stat } from "node:fs/promises";
import { secretFileWarning } from "../secrets.js";
import { DEFAULT_TOKEN_NAME, onContainerLayer, secretState, tokenShowHint } from "../state.js";
import { heading, plain, problem, warning } from "./format.js";

/** @type {import("./index.js").Section} */
export async function section(options, _registry, runtime) {
    const plan = runtime.state;
    if (!plan || (!plan.stateDir && !plan.secrets.length)) {
        return { items: [], upgrade: [] };
    }
    const items = [heading(`Credentials:${plan.stateDir ? ` state directory ${plan.stateDir} (${await dirText(plan.stateDir)})` : ""}`, "Credentials")];
    const stop = { stops: /** @type {const} */ (true) };
    if (plan.stateDir && plan.secrets.some((s) => s.fromState) && (await onContainerLayer(plan.stateDir, runtime.env))) {
        items.push(warning(`the state directory ${plan.stateDir} is on the container's own layer: its tokens and keys are lost when the container is removed; mount a volume there`));
    }
    for (const secret of plan.secrets) {
        const from = secret.fromState ? "default of the state directory" : `${secret.at}, create: true`;
        const found = await secretState(secret, plan);
        items.push(plain(`${secret.words} (${from}): ${secret.path}, ${found.state === "present" ? "there" : found.state === "created" ? "made at the first start" : "cannot be made"}`));
        if (found.state === "blocked") {
            const text = `${secret.words} cannot be made in ${secret.path}: ${found.why}`;
            if (secret.fromState && secret.use !== "token") {
                items.push(warning(`${text}; a random key is used, so ${secret.use === "downloads" ? "download links stop working on a restart" : "the same person gets another hash after a restart"}`));
            } else {
                items.push(problem(`${text}${secret.fromState ? `; mount a writable volume at ${plan.stateDir}, or give the token in $${runtime.tokenEnv}` : ""}`, stop));
            }
        }
        if (found.state === "present") {
            const shared = await secretFileWarning({ file: secret.path }, options, `${secret.words}'s file ${secret.path}`);
            if (shared) {
                items.push(warning(shared));
            }
        }
    }
    if (plan.defaultToken) {
        items.push(plain(`read the token with: ${await tokenShowHint(DEFAULT_TOKEN_NAME, { env: runtime.env, stateDir: plan.stateDir })}`));
    }
    return { items, upgrade: [] };
}

/** The state directory in a few words: missing, writable or not. */
async function dirText(dir) {
    const info = await stat(dir).catch(() => null);
    if (!info?.isDirectory()) {
        return "does not exist: create it or mount a volume there";
    }
    const writable = await access(dir, constants.W_OK).then(() => true, () => false);
    return writable ? "writable" : "not writable";
}

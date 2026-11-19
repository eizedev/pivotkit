/*
 * pivotkit-server/policy: the exposure policy (show, values, summary, hide; profiles), for another
 * front end over the same sources. src/policy.js holds it; this entry exports its public part.
 *
 *   import { resolvePolicy, levelOf } from "pivotkit-server/policy";
 */

export { AUTO_VALUES, autoLevel, deniedWord, exposeFindings, exposeSource, levelInfo, levelOf, listsAll, POLICY_DEFAULTS, POLICY_LEVELS, resolvePolicy, stricter, touchesClosed, withStats } from "./policy.js";

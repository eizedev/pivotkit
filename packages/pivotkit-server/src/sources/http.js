/*
 * HTTP sources: not configurable in this version (sources.<id>.http is no option yet), so no source
 * reaches this kind; the registry's dispatch has its place.
 */

import { OperationError } from "pivotkit-report/operations";

const unavailable = () => {
    throw new OperationError("INTERNAL", "HTTP sources are not available in this version");
};

export const httpKind = Object.freeze({ specOf: unavailable, run: unavailable });

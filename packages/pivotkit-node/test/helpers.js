// Shared test data and the repository's temporary directories.
import { tempDir as sharedTempDir } from "../../../tests/temp-dir.js";

export const SALES_CSV = "Region,Product,Units,Date\nNorth,A,3,2026-01-05\nSouth,B,4,2026-09-01\nNorth,B,2,2026-10-01\nWest,A,5,2025-06-30\n";

export const tempDir = (prefix = "pivotkit-node-") => sharedTempDir(prefix);

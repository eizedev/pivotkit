// The report with the <style> fallback (no-constructable.js ran first).
import { DATASETS } from "../../../../examples/playground/src/data.js";

const el = document.getElementById("plain");
el.data = DATASETS.sales.make(300);
el.defaultView = DATASETS.sales.presets[0].view;

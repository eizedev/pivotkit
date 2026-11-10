// The page of tests/browser/xlsx.spec.js: pivotkit-xlsx as it ships (dist/, the descriptor and the
// reader chunk it loads) reads the workbook a person picks, under the strict CSP of xlsx.html. The
// result goes into #result as JSON text; a violation of the policy is counted.
import xlsxReader from "../packages/pivotkit-xlsx/dist/index.js";

const violations = [];
document.addEventListener("securitypolicyviolation", (e) => violations.push(e.violatedDirective));

const result = document.getElementById("result");
document.getElementById("file").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    result.removeAttribute("data-done");
    try {
        const reader = await xlsxReader.load();
        const started = performance.now();
        const table = await reader.read(file);
        result.textContent = JSON.stringify({
            rows: table.rowCount,
            columns: table.columns,
            types: table.types,
            first: table.columns.map((_, c) => table.data[c][0]),
            notes: table.notes.map((n) => n.message),
            ms: Math.round(performance.now() - started),
            violations
        });
    } catch (error) {
        result.textContent = JSON.stringify({ error: error.message, reason: error.details?.reason, violations });
    }
    result.setAttribute("data-done", "");
});

// Compiled by `npm run test:types` against the generated declarations, through the package's exports.
import { encode } from "pivotkit-core";
import { render, RENDER_FORMATS, REPORT_LIMITS, cleanSvg, type RenderResult } from "pivotkit-report";
import { parseTemplate, fillTemplate, PLACEHOLDERS } from "pivotkit-report/template";

export async function report(rows: Array<Record<string, unknown>>, echarts: { init: Function }): Promise<number> {
    const result: RenderResult = await render({ rows: ["Region"] }, rows, { format: "html", echarts, now: "2026-11-13", locale: "de-DE", strict: true, size: { width: 640 } });
    const bytes: Uint8Array | null = result.body;
    const text: string | undefined = result.text;
    const svg = await render({ rows: ["Region"] }, encode(rows), { format: "svg", echarts, tokens: { "--pk-chart-1": "#123456" } });
    const filled: string = fillTemplate(parseTemplate("<p>{{title}}</p>"), { title: "x" });
    return (bytes?.length ?? 0) + (text?.length ?? 0) + svg.issues.length + filled.length + RENDER_FORMATS.html.extension.length + REPORT_LIMITS.tableCells + Object.keys(PLACEHOLDERS).length + cleanSvg("<svg></svg>").length;
}

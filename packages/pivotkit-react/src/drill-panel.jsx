/*
 * The rows behind a clicked value, in a side panel over the report: the cell's labels as the title,
 * the number of rows, and the first rows (the limit of the drill-down) as a table, its headers with the
 * fields' display names and descriptions (fieldDefaults). Each column is as wide as its content needs,
 * a long text wraps, so the table scrolls sideways less. It is modal: the focus moves in, Tab stays
 * inside, Escape (wherever the focus is) and the close button close it, and the focus goes back to the
 * value that opened it. Enlarge lets the panel fill the report (Escape or Reduce brings it back; the
 * focus stays on the button; not part of the view). Export copies the rows or downloads them
 * (drill-export.js).
 */

import React, { useContext, useEffect, useId, useRef, useState } from "react";
import { useModal } from "./dom.js";
import { exportDrill } from "./drill-export.js";
import { Icon } from "./icons.jsx";
import { fill, plural } from "./labels.js";
import { LayerContext, MenuButton } from "./popover.jsx";
import { ExportOption } from "./toolbar-panels.jsx";
import { Section } from "./section.jsx";
import { prepareExporters } from "./export-run.js";

/**
 * @typedef {{ title: string, name: string, count: number, locale: string, indices: ArrayLike<number>, formats: Record<string, string>,
 *   columns: Array<{ name: string, numeric: boolean, label?: string, description?: string }>, rows: string[][] }} Drill
 */

/**
 * @param {{ drill: Drill | null, onClose: () => void, labels: import("./labels.js").UiLabels, locale: string,
 *   exportContext?: { encoded: import("pivotkit-core").Encoded, onExport?: (file: import("./export-run.js").ExportFile) => unknown,
 *     announce: (text: string, extra?: { tone?: "error" }) => void, root: React.RefObject<HTMLElement | null> } }} props
 */
export function DrillPanel({ drill, onClose, labels, locale, exportContext }) {
    const id = useId();
    const panel = useRef(/** @type {HTMLDivElement | null} */ (null));
    const [big, setBig] = useState(false);
    // a narrow report's panel fills it already: no Enlarge there
    const narrow = useContext(LayerContext).size === "narrow";
    // Escape: an enlarged panel goes back to its size first, the next one closes it
    const { onKeyDown } = useModal(panel, Boolean(drill), big ? () => setBig(false) : onClose);
    useEffect(() => {
        // the export module, before a click asks for it: a copy right in the click is allowed everywhere
        if (drill && exportContext) {
            prepareExporters();
        }
    }, [drill, exportContext]);
    if (!drill) {
        return null;
    }
    const n = drill.count.toLocaleString(locale);
    const partial = drill.rows.length < drill.count;
    const run = (kind, close) => () => {
        close();
        if (exportContext) {
            void exportDrill(kind, { drill, labels, ...exportContext, root: exportContext.root.current });
        }
    };
    return (
        <>
            <div className="pk-scrim pk-drill-scrim" onClick={onClose} aria-hidden="true" />
            <div
                className={`pk-drill${big && !narrow ? " pk-drill-big" : ""}`}
                role="dialog"
                aria-modal="true"
                aria-labelledby={id}
                data-testid="drill-panel"
                data-pk-enlarged={big && !narrow ? "" : undefined}
                ref={panel}
                tabIndex={-1}
                // Tab stays inside, but not for the keys of the Export menu (a popover of its own outside)
                onKeyDown={(e) => {
                    if (e.target instanceof Node && panel.current?.contains(e.target)) {
                        onKeyDown(e);
                    }
                }}
            >
                <div className="pk-drill-head">
                    <div className="pk-drill-heading">
                        <h2 id={id}>{labels.drillTitle}</h2>
                        <p className="pk-drill-path">{drill.title}</p>
                        <p className="pk-muted" data-testid="drill-count">
                            {partial ? fill(labels.drillShown, { shown: drill.rows.length.toLocaleString(locale), count: n }) : plural(labels.drillCount, drill.count, { lang: labels.lang, locale })}
                        </p>
                    </div>
                    <div className="pk-drill-actions">
                        {exportContext ? (
                            <MenuButton label={labels.exportLabel} icon="download" text={labels.exportLabel} role="dialog" align="end" testId="drill-export" className="pk-btn pk-small-btn">
                                {(close) => (
                                    <>
                                        {partial ? (
                                            <p className="pk-hint pk-menu-hint" data-testid="drill-export-note">
                                                {fill(labels.drillExportNote, { shown: drill.rows.length.toLocaleString(locale), count: n })}
                                            </p>
                                        ) : null}
                                        {/* the same sections as the toolbar's Export menu, folded or open with them */}
                                        <Section title={labels.exportDownload} id="exportDownload">
                                            <ExportOption icon="file" text={labels.drillCsv} onSelect={run("drill-csv", close)} testId="drill-csv" />
                                            <ExportOption icon="file" text={labels.drillXlsx} onSelect={run("drill-xlsx", close)} testId="drill-xlsx" />
                                        </Section>
                                        <Section title={labels.exportCopy} id="exportCopy">
                                            <ExportOption icon="copy" text={labels.drillCopy} info="drillCopy" onSelect={run("drill-copy", close)} testId="drill-copy" />
                                            <ExportOption icon="copy" text={labels.drillJson} info="drillJson" onSelect={run("drill-json", close)} testId="drill-json" />
                                        </Section>
                                    </>
                                )}
                            </MenuButton>
                        ) : null}
                        {/* as the result's Enlarge: says what a click does, Enlarge or Reduce; a changing name is no
                            toggle (no aria-pressed), the highlight shows the state (data-pk-on) */}
                        {narrow ? null : (
                            <button type="button" className="pk-btn pk-pressable pk-small-btn" data-pk-on={big ? "" : undefined} onClick={() => setBig((on) => !on)} data-testid="drill-enlarge">
                                <Icon name="enlarge" size={14} />
                                <span className="pk-btn-text">{big ? labels.reduce : labels.enlarge}</span>
                            </button>
                        )}
                        <button type="button" className="pk-icon-btn" onClick={onClose} data-autofocus="" aria-label={labels.close} title={labels.close}>
                            <Icon name="x" />
                        </button>
                    </div>
                </div>
                <div className="pk-drill-body" tabIndex={0} aria-label={drill.title}>
                    <table className="pk-drill-table">
                        <thead>
                            <tr>
                                {drill.columns.map((c) => (
                                    <th key={c.name} scope="col" className={c.numeric ? "pk-num" : undefined} title={c.description} aria-description={c.description}>
                                        {c.label ?? c.name}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {drill.rows.map((row, i) => (
                                <tr key={i}>
                                    {drill.columns.map((c, k) => (
                                        <td key={c.name} className={c.numeric ? "pk-num" : undefined}>
                                            {/* a long text wraps inside the cell's widest width (styles.css) */}
                                            {c.numeric || row[k].length < 24 ? row[k] : <div className="pk-drill-text">{row[k]}</div>}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </>
    );
}

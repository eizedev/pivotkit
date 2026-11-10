/*
 * The form fields the menus' levels share: a number typed in the report's locale with its problem
 * under it, the keys of a field that applies what is typed, and the pick of the value a filter or a
 * top N goes by. Loaded with the menus (menus.js).
 */

import React, { useId } from "react";
import { useFormName } from "./dom.js";
import { fill } from "./labels.js";
import { refLabel } from "./names.js";
import { parseNumber } from "./numbers.js";
import { sameRef } from "./view-ops.js";
import { measureChoices, withMeasure } from "./menu-ops.js";

/**
 * A number typed into a menu, read in the report's locale (numbers.js). `kind` says what it must be:
 * "number" any number, "size" above 0, "count" a whole number of 1 or more. The problem shows while
 * the text is not such a number, and for an empty required field once Apply was pressed; `max`: the
 * largest count, a larger one says so.
 * @param {string} text
 * @param {{ kind?: "number" | "size" | "count", required?: boolean, tried?: boolean, max?: number, labels: any, locale: string }} options
 * @returns {{ value: number | null, problem: string | null }}
 */
export function readNumber(text, { kind = "number", required = true, tried = false, max, labels, locale }) {
    const value = parseNumber(text, locale);
    if (max !== undefined && value !== null && Number.isInteger(value) && value > max) {
        return { value: null, problem: fill(labels.countMax, { max: max.toLocaleString(locale) }) };
    }
    const ok = value !== null && (kind === "number" || (kind === "size" ? value > 0 : Number.isInteger(value) && value >= 1));
    const say = () => (kind === "count" ? labels.countInvalid : fill(kind === "size" ? labels.sizeInvalid : labels.numberInvalid, { example: (kind === "size" ? 0.5 : 1234.5).toLocaleString(locale) }));
    if (text.trim() === "") {
        return { value: null, problem: required && tried ? say() : null };
    }
    return ok ? { value, problem: null } : { value: null, problem: say() };
}

/**
 * The text field of a number: a text input for the locale's own way of writing numbers (a number
 * input would read "1.000,5" by the browser's rules, not the report's), its problem under it.
 * @param {{ value: string, onChange: (text: string) => void, problem: string | null, label: string,
 *   testId: string, className?: string, shown?: string, shownClass?: string, onKeyDown?: (e: React.KeyboardEvent) => void,
 *   onBlur?: () => void, onFocus?: () => void, autoFocus?: boolean }} props
 */
export function NumberField({ value, onChange, problem, label, testId, className = "pk-field-label", shown, shownClass, onKeyDown, onBlur, onFocus, autoFocus }) {
    const id = useId();
    const name = useFormName();
    return (
        <>
            <label className={className}>
                {shown ? <span className={shownClass}>{shown}</span> : <span className="pk-sr">{label}</span>}
                <input
                    type="text"
                    name={name}
                    inputMode="decimal"
                    autoComplete="off"
                    spellCheck={false}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onKeyDown={onKeyDown}
                    onBlur={onBlur}
                    onFocus={onFocus}
                    aria-label={label}
                    aria-invalid={problem ? true : undefined}
                    aria-describedby={problem ? id : undefined}
                    data-autofocus={autoFocus ? "" : undefined}
                    data-testid={testId}
                />
            </label>
            {problem ? (
                <p id={id} className="pk-form-problem" data-testid={`${testId}-problem`}>
                    {problem}
                </p>
            ) : null}
        </>
    );
}

/**
 * The keys of a field that applies what is typed: Enter applies now; Escape gives back what applies,
 * or, when nothing was changed, goes back a level.
 * @param {{ now: () => void, restore: () => boolean, back: () => void }} actions
 */
export const fieldKeys = ({ now, restore, back }) => (/** @type {React.KeyboardEvent} */ e) => {
    if (e.key === "Enter") {
        e.preventDefault();
        now();
    } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (!restore()) {
            back();
        }
    }
};

/**
 * The measure a top N or a value condition goes by: a select when the view has several values that
 * give numbers, else the one name. `index` is the position in `choices`.
 * @param {{ choices: Array<{ field: string | null, agg: string }>, names: string[], index: number,
 *   onChange: (index: number) => void, label: string, prefix?: string, testId: string }} props
 */
export function MeasurePick({ choices, names, index, onChange, label, prefix, testId }) {
    const name = useFormName();
    if (choices.length < 2) {
        return (
            <span className="pk-by" data-testid={testId}>
                {prefix ? `${prefix} ${names[0]}` : names[0]}
            </span>
        );
    }
    return (
        <label className="pk-field-label pk-by-pick">
            {prefix ? <span>{prefix}</span> : <span className="pk-sr">{label}</span>}
            <select name={name} value={index} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} data-testid={testId}>
                {choices.map((c, i) => (
                    <option key={`${c.field}:${c.agg}`} value={i}>
                        {names[i]}
                    </option>
                ))}
            </select>
        </label>
    );
}

/** The index of a reference in the choices; the first (the default) when it is not there. */
export const choiceIndex = (choices, ref) => Math.max(0, choices.findIndex((c) => sameRef(c, ref)));

/** The measures a filter of a field can go by, with the one it goes by now, and their names. */
export function measuresOf(view, types, labels, ref) {
    const choices = withMeasure(measureChoices(view, (f) => types.get(f.toLowerCase())), ref);
    return { choices, names: choices.map((c) => refLabel(view, c, labels)) };
}

/** The decimal mark of a locale ("," for de-DE), "." when it has none or is invalid. */
export function localeDecimal(locale) {
    if (!locale) return ".";
    try {
        const part = new Intl.NumberFormat(locale).formatToParts(1.5).find((p) => p.type === "decimal");
        return part?.value === "," ? "," : ".";
    } catch {
        return ".";
    }
}

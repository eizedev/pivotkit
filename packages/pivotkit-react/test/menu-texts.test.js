// The menus' texts of a language besides English: a file of their own per language, loaded with the
// menus (lazy-menus.jsx). A file of its own here too, so the menus' module state (which languages are
// added) starts empty, whatever other tests did.
import { test } from "node:test";
import assert from "node:assert/strict";
import { options } from "../build.js";
import { LABELS, resolveLabels } from "../src/labels.js";
import { de as menuDe } from "../src/menu-labels-de.js";
import { addMenuTexts, en as menuEn, hasMenuTexts, menuLabels } from "../src/menu-labels.js";
import { MENU_TEXTS_OF } from "../src/menu-texts.js";

const keys = (o, p = "") => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" && !Array.isArray(v) ? keys(v, `${p}${k}.`) : [`${p}${k}`])).sort();

test("every language of LABELS besides English has its menu texts: a loader and a file of their own in the build", async () => {
    const others = Object.keys(LABELS).filter((lang) => lang !== "en");
    assert.ok(others.length > 0);
    assert.deepEqual(Object.keys(MENU_TEXTS_OF).sort(), others.sort());
    for (const lang of others) {
        assert.equal(/** @type {any} */ (options.entryPoints)[`menu-texts-${lang}`], `src/menu-labels-${lang}.js`, lang);
        // the loader gives the language's texts, with every key of the English ones
        assert.deepEqual(keys(await MENU_TEXTS_OF[lang]()), keys(menuEn), lang);
    }
});

test("until a language's menu texts are added, English stands in; then they show, for the same labels object", () => {
    const labels = resolveLabels("de-DE", { cancel: "Doch nicht" });
    assert.equal(hasMenuTexts("de"), false);
    const before = menuLabels(labels);
    // the first load's texts are German already; the menus' fall back to English, a host's text wins
    assert.deepEqual([before.zones.rows, before.apply, before.cancel], ["Zeilen", "Apply", "Doch nicht"]);
    addMenuTexts("de", menuDe);
    assert.equal(hasMenuTexts("de"), true);
    // merged again with the German texts, not the English kept from before
    const after = menuLabels(labels);
    assert.deepEqual([after.zones.rows, after.apply, after.cancel], ["Zeilen", "Anwenden", "Doch nicht"]);
    assert.equal(menuLabels(labels), after);
});

test("a host's text for a text that moved to the menus wins over the default, in German and English", () => {
    addMenuTexts("de", menuDe);
    for (const locale of ["de", "en-US"]) {
        const labels = menuLabels(resolveLabels(locale, { toastLinkCopied: "X", groupsExpanded: { other: "{count} offen" } }));
        assert.equal(labels.toastLinkCopied, "X", locale);
        assert.equal(labels.groupsExpanded.other, "{count} offen", locale);
        // the rest of the moved texts keep the language's defaults
        assert.equal(labels.toastJsonCopied, locale === "de" ? "Ansicht als JSON kopiert" : "View copied as JSON", locale);
    }
});

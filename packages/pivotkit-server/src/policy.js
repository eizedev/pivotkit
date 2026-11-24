/*
 * The exposure policy: what the model may see of a source. Per field one level, set by the operator
 * per source over the server's default; from open to closed:
 *
 * - "show": names, counts and values (items, smallest and largest); results over it may come back
 *   inline;
 * - "values": name, type, counts and the field's distinct values as a complete list, nothing more: a
 *   result over it still goes to a file, as for "summary". Only a text field whose values fit
 *   (policy.valuesMax, at most NAME_TEXT characters each) on a source that shows its counts and rows
 *   gets it; any other field asked for "values" is "summary";
 * - "summary" (the default): name, type and counts, no value; a result that touches it goes to a
 *   file, and its shape (rows, bytes) is withheld;
 * - "hide": the column is dropped when the data is read; nothing about it reaches the model but the
 *   number of hidden fields.
 *
 * A field's level (levelOf): its own rule, else "hide" for a column the file gives no header (a
 * blank header cell, a row longer than the header: its values may be another column's, shifted by a
 * delimiter in a value), else "hide" for a repeated header of a hidden column, else the automatic
 * rule, else the default. The automatic rule (autoLevel) gives "values" to a text
 * field of a registered source whose data looks like a category (few values, each in many rows, short,
 * nothing personal or technical, a name off the deny list); it applies only where no default is
 * written (server, source or profile), never to a caller bound to a profile and never to a file: path,
 * and policy.autoValues false turns it off. It reads the data's statistics (stats.js), bound to the
 * policy with withStats(): never a row. Without statistics it gives nothing, and "values" falls back to
 * "summary": the policy fails closed.
 *
 * Applied in the main thread to what an operation returns, never inside the operation, so one policy
 * module guards every tool and route. Names are matched case-insensitively, as pivotkit-core matches
 * fields.
 *
 * A profile (policy.profiles.<name>) is a policy of the same shape bound to a caller (a token, an
 * OAuth client or scope). It is laid over the source's policy: a field the source's policy hides
 * stays hidden in every profile; any other field takes the profile's level for it, else the
 * profile's default, else the source's level. A caller without a profile gets the source's policy,
 * never more.
 */

import { findingText } from "pivotkit-report/operations";

/**
 * The levels, from most to least visible. A source's rule for a field replaces the server's, a
 * profile's replaces the source's, except that a field the source's policy hides stays hidden; only
 * two rules of one part for one field (two spellings of its name) keep the stricter of the two.
 * @type {readonly ["show", "values", "summary", "hide"]}
 */
export const POLICY_LEVELS = Object.freeze(/** @type {const} */ (["show", "values", "summary", "hide"]));

/** @typedef {"show" | "values" | "summary" | "hide"} Level */

/** Each level's place in POLICY_LEVELS: higher is stricter. */
const STRICTNESS = Object.freeze(Object.fromEntries(POLICY_LEVELS.map((level, i) => [level, i])));

/** The stricter of two levels. @param {Level} a @param {Level} b @returns {Level} */
export const stricter = (a, b) => (STRICTNESS[a] >= STRICTNESS[b] ? a : b);

/** The most characters of a field name that reaches the model. */
export const NAME_TEXT = 80;

/**
 * Whether the automatic "values" rule is on where the operator says nothing (policy.autoValues): the
 * one place the shipped default is set.
 */
export const AUTO_VALUES_DEFAULT = false;

/**
 * Words a field name must not hold for the automatic "values" level, in English and German: people
 * and their roles, personal traits, health, beliefs, money, places, family and free text. Matched per
 * word of the name (see deniedWord for how a name is read): an entry of AUTO_VALUES_WHOLE_WORDS or
 * of fewer than four letters as a word of its own, with a plural or German ending ("Age", "Namen",
 * not "Stage" or "Filename"); any other anywhere in a word of the name ("Kundenname", "Birthdate")
 * and, from five letters, across spaces ("Ow ner"); an entry of two words as those words in a row
 * ("created by"). A second layer behind the statistics, not the safeguard; policy.autoValues.deny
 * adds words.
 */
export const AUTO_VALUES_DENY = Object.freeze([
    // people and their roles
    "name", "firstname", "lastname", "surname", "fullname", "nickname", "vorname", "nachname", "customer", "client", "employee", "owner", "assignee", "responsible", "contact", "agent", "author", "manager", "team lead", "supervisor", "person", "user", "patient", "student", "teacher", "doctor", "approver", "reviewer", "driver", "applicant", "partner", "sender", "sales rep",
    "creator", "reporter", "requester", "submitter", "initiator", "editor", "staff", "worker", "member", "participant", "attendee", "guest", "tenant", "resident", "witness", "victim", "suspect", "wife", "husband", "son", "daughter",
    "created by", "assigned to", "modified by", "updated by", "approved by", "owned by", "account holder",
    "kunde", "mitarbeiter", "besitzer", "eigentümer", "inhaber", "bearbeiter", "zuständig", "verantwortlich", "ansprechpartner", "kontakt", "autor", "leiter", "nutzer", "benutzer", "lehrer", "arzt", "erstellt von", "fahrer", "bewerber", "betreuer", "vertrieb", "zugewiesen", "vorgesetzter",
    // personal traits, beliefs and status
    "gender", "sex", "sexual", "orientation", "race", "ethnicity", "ethnic", "religion", "belief", "nationality", "citizen", "immigra", "party", "politics", "political", "vote", "union", "birth", "dob", "born", "age", "crimin", "conviction",
    "geschlecht", "ethnie", "konfession", "glaube", "nationalität", "staatsangehörigkeit", "partei", "politik", "wahl", "gewerkschaft", "geburt", "geb datum", "gebdat", "jahrgang", "alter", "strafe",
    // health
    "diagnosis", "health", "medical", "medication", "illness", "disease", "treatment", "therap", "allerg", "pregnan", "disability", "weight",
    "diagnose", "gesundheit", "medikament", "medikation", "krankheit", "schwanger", "behinderung", "gewicht",
    // money and work
    "salary", "income", "bonus", "payroll", "compensation", "pay", "wage", "bank", "account number", "credit", "loan", "mortgage", "debt", "wealth", "net worth", "ssn", "tax", "insurance", "job",
    "gehalt", "lohn", "vergütung", "einkommen", "konto", "kredit", "schufa", "schulden", "vermögen", "steuer", "versicherung", "beruf",
    // places
    "address", "adress", "street", "city", "postcode", "zip", "adresse", "anschrift", "straße", "stadt", "plz", "wohnort",
    // family
    "spouse", "mother", "father", "child", "passport", "ehepartner", "mutter", "vater", "kinder", "kindes", "ausweis",
    // free text
    "comment", "note", "reason", "kommentar", "notiz", "bemerkung", "grund"
]);

/**
 * Entries of AUTO_VALUES_DENY that are also parts of everyday neutral words ("Capacity", "Trace",
 * "Reunion", "Alternative", "Notebook", "Grundstück"): they match only as a word of their own, with a
 * plural or German ending.
 */
export const AUTO_VALUES_WHOLE_WORDS = Object.freeze(["name", "race", "city", "union", "alter", "note", "grund", "son", "pay", "tax", "age", "sex", "job", "zip", "plz", "ssn", "dob", "born", "bank", "party", "vote", "wahl", "wife", "guest", "staff", "member", "editor", "credit", "loan", "kinder", "kindes", "agent", "wage", "user"]);

/** The endings a whole-word entry may have: plural and German forms ("Namen", "Kunden", "Wählerin"). */
const WORD_ENDINGS = Object.freeze(["", "s", "es", "n", "en", "er", "in", "innen"]);

/**
 * The automatic "values" rule's thresholds: a text field qualifies with at most `maxDistinct` distinct
 * values, each in at least `minRowsPerValue` rows, in a source of at least `minRows` rows with at least
 * `rowsPerValue` rows per distinct value, values of at most `maxLength` characters, none looking like
 * personal or technical data (stats.js LOOKS_LIKE), its name off the deny list. policy.autoValues as an
 * object sets maxDistinct, minRowsPerValue and minRows, and adds words to `deny`.
 */
export const AUTO_VALUES = Object.freeze({ maxDistinct: 12, minRowsPerValue: 5, minRows: 100, rowsPerValue: 20, maxLength: 40, deny: AUTO_VALUES_DENY });

/** The kinds of stats.js LOOKS_LIKE in words. */
const LOOKS_TEXT = Object.freeze({ email: "an e-mail address", phone: "a phone number", url: "an address on the web", iban: "an IBAN", ip: "an IP address", digits: "a run of 6 or more digits" });

/**
 * @typedef {object} AutoValues
 * @property {number} maxDistinct
 * @property {number} minRowsPerValue
 * @property {number} minRows
 * @property {number} rowsPerValue
 * @property {number} maxLength
 * @property {readonly string[]} deny
 */

/**
 * @typedef {object} Policy
 * @property {Level} default
 * @property {Map<string, Level>} fields  by lower-case name
 * @property {number} items  values listed per "show" field
 * @property {number} valuesMax  the most values a "values" field may have
 * @property {boolean} rows  the row count is shown
 * @property {boolean} counts  distinct and blank counts are shown
 * @property {{ cells: number, bytes: number } | false} inline  results that may come back in the tool result
 * @property {boolean} results  REST: the caller may download the rendered file
 * @property {boolean} implicitDefault  no default is written at server, source or profile level
 * @property {AutoValues | false} auto  the automatic "values" rule, where it applies
 * @property {import("./stats.js").SourceStats | null} stats  the data's statistics (withStats), or none yet
 */

/** The server's policy defaults. */
export const POLICY_DEFAULTS = Object.freeze({ default: /** @type {Level} */ ("summary"), items: 20, valuesMax: 50, rows: true, counts: true, inline: Object.freeze({ cells: 500, bytes: 32_768 }), results: false, autoValues: AUTO_VALUES_DEFAULT });

/** A deny list, read for deniedWord at once (denyEntries keeps it), so a rule reads its list once. */
const withDenyRead = (deny) => {
    const frozen = Object.freeze(deny);
    denyEntries(frozen);
    return frozen;
};

/**
 * The automatic rule of a policy.autoValues option: off, the thresholds, or the thresholds with the
 * option's numbers and deny words. An option object is read once and its result kept: the options
 * count as frozen once validateOptions checked them.
 * @param {boolean | { maxDistinct?: number, minRowsPerValue?: number, minRows?: number, deny?: string[] } | undefined} option
 * @returns {AutoValues | false}
 */
export function autoValuesOf(option) {
    if (option === false) {
        return false;
    }
    // validateOptions takes a boolean or an object; anything else counts as true
    if (option === null || typeof option !== "object") {
        return AUTO_VALUES;
    }
    // resolvePolicy asks on every request: the deny list is read once per option object
    const known = autoValuesMade.get(option);
    if (known) {
        return known;
    }
    const { maxDistinct, minRowsPerValue, minRows, deny } = option;
    const made = {
        ...AUTO_VALUES,
        ...(maxDistinct !== undefined ? { maxDistinct } : {}),
        ...(minRowsPerValue !== undefined ? { minRowsPerValue } : {}),
        ...(minRows !== undefined ? { minRows } : {}),
        deny: withDenyRead([...AUTO_VALUES.deny, ...(deny ?? []).map((w) => w.normalize("NFC").toLowerCase().trim()).filter(Boolean)])
    };
    autoValuesMade.set(option, made);
    return made;
}

/** autoValuesOf's result per policy.autoValues object. */
const autoValuesMade = new WeakMap();

/**
 * The policy.autoValues option that holds for a source: the source's, else the server's, else the
 * shipped default.
 * @param {any} server  options.policy
 * @param {any} [source]  options.sources[id].policy
 */
export const autoValuesOption = (server, source) => source?.autoValues ?? server?.autoValues ?? POLICY_DEFAULTS.autoValues;

/**
 * A source's policy: its own settings over the server's, fields merged (the source's win); with a
 * profile, the profile laid over that (see the top of this file). `file`: the policy of a file: path,
 * which the automatic rule never applies to.
 * @param {any} server  options.policy
 * @param {any} [source]  options.sources[id].policy (or options.files.policy)
 * @param {any} [profile]  options.policy.profiles[name]
 * @param {{ file?: boolean }} [how]
 * @returns {Policy}
 */
export function resolvePolicy(server = {}, source = {}, profile = undefined, how = {}) {
    const pick = (key) => profile?.[key] ?? source?.[key] ?? server?.[key] ?? POLICY_DEFAULTS[key];
    /** @type {Map<string, Level>} */
    const fields = new Map();
    // the source's rules override the server's; two names of one part that match the same field
    // ("Customer Name" and "customer  name") keep the stricter level, whichever comes last
    for (const part of [server?.fields, source?.fields]) {
        const own = new Map();
        for (const [name, level] of Object.entries(part ?? {})) {
            const key = fieldKey(name);
            const before = own.get(key);
            own.set(key, before !== undefined ? stricter(before, level) : level);
        }
        for (const [key, level] of own) {
            fields.set(key, level);
        }
    }
    let level = source?.default ?? server?.default ?? POLICY_DEFAULTS.default;
    if (profile) {
        const base = { default: level, fields: new Map(fields) };
        if (profile.default) {
            // a field the base names keeps "hide", any other takes the profile's default; so does
            // every other field, unless the base hides it by default
            for (const [name, l] of base.fields) {
                fields.set(name, l === "hide" ? "hide" : profile.default);
            }
            level = level === "hide" ? "hide" : profile.default;
        }
        for (const [name, l] of Object.entries(profile.fields ?? {})) {
            const key = fieldKey(name);
            fields.set(key, levelOf(base, key) === "hide" ? "hide" : l);
        }
    }
    const inline = pick("inline");
    const implicitDefault = profile?.default === undefined && source?.default === undefined && server?.default === undefined;
    // the automatic rule raises a field only where the operator set no default and bound no profile:
    // a profile's own levels are what its callers get, never more
    const autoOption = autoValuesOption(server, source);
    const auto = implicitDefault && !profile && !how.file ? autoValuesOf(autoOption) : false;
    return {
        default: level,
        fields,
        items: pick("items"),
        valuesMax: source?.valuesMax ?? server?.valuesMax ?? POLICY_DEFAULTS.valuesMax,
        rows: pick("rows"),
        counts: pick("counts"),
        inline: inline === false ? false : { ...POLICY_DEFAULTS.inline, ...inline },
        results: pick("results") === true,
        implicitDefault,
        auto,
        stats: null
    };
}

/**
 * The policy with the statistics of the data an operation read (stats.js), which the "values" level
 * and the automatic rule are decided by. Without them (null), no field is at "values".
 * @param {Policy} policy
 * @param {import("./stats.js").SourceStats | null | undefined} stats
 * @returns {Policy}
 */
export const withStats = (policy, stats) => ({ ...policy, stats: stats ?? null });

/**
 * A field's statistics by its key, own keys only: a name such as "constructor" is data, never an
 * object's inherited member.
 * @param {import("./stats.js").SourceStats | null | undefined} stats
 * @param {string} key  fieldKey of the field's name
 */
export const fieldStatsOf = (stats, key) => (stats?.fields && Object.hasOwn(stats.fields, key) ? stats.fields[key] : undefined);

/**
 * A field name as the policy matches it: Unicode NFC (a file from macOS may write "ö" as two code
 * points), trimmed, lower case. Whitespace counts as one space, whichever kind (a no-break or
 * ideographic space, a doubled one: an Excel header often has them), so a rule on "Customer Name"
 * also matches such a column.
 */
export const fieldKey = (name) => String(name).normalize("NFC").replace(/\s+/gu, " ").trim().toLowerCase();

/** A reader's name for a repeated header ("Email (2)", "email (3)"): the part before it is the first one's name. */
const REPEATED = /^(.*\S) \(\d+\)$/;

/**
 * Letters a name could hide a deny word with, as the plain Latin letter: look-alikes of other scripts
 * (Cyrillic, Greek), Latin small capitals and other Latin letters NFD does not take apart, and the
 * digits written for letters ("0wner").
 */
const LOOK_ALIKES = Object.freeze({
    а: "a", е: "e", о: "o", р: "p", с: "c", у: "y", х: "x", і: "i", ј: "j", ѕ: "s", к: "k", м: "m", т: "t", н: "h", в: "b", α: "a", ο: "o", ρ: "p", ε: "e", ι: "i", κ: "k", ν: "v", τ: "t", υ: "u",
    ᴀ: "a", ʙ: "b", ᴄ: "c", ᴅ: "d", ᴇ: "e", ꜰ: "f", ɢ: "g", ʜ: "h", ɪ: "i", ᴊ: "j", ᴋ: "k", ʟ: "l", ᴍ: "m", ɴ: "n", ᴏ: "o", ᴘ: "p", ʀ: "r", ꜱ: "s", ᴛ: "t", ᴜ: "u", ᴠ: "v", ᴡ: "w", ʏ: "y", ᴢ: "z",
    ω: "w", ı: "i", ȷ: "j", ł: "l", ø: "o", đ: "d", ħ: "h", ŧ: "t", ɑ: "a", ɡ: "g", ƒ: "f", ŀ: "l", ɩ: "i", ɵ: "o",
    0: "o", 3: "e", 4: "a", 5: "s"
});

/** German letters as they are written without them: "Zuständig" and "Zustaendig" read alike. */
const GERMAN = Object.freeze({ ä: "ae", ö: "oe", ü: "ue", ß: "ss" });

/**
 * The words of a text as the deny list reads them: NFKC (fullwidth and other compatibility forms
 * folded), no invisible or control characters, split at camelCase, lower case, German umlauts and ß
 * written out, NFD with every mark removed ("Ōwner", "Owneŕ"), look-alike letters and digits as Latin
 * letters ("1" as `one`: a name is read with "i" and with "l"), split at everything else.
 * @param {string} text
 * @param {"i" | "l"} [one]
 */
const denyWords = (text, one = "i") =>
    String(text)
        .normalize("NFKC")
        .replace(/[\p{Cf}\p{Cc}]/gu, "")
        .replace(/(\p{Ll})(\p{Lu})/gu, "$1 $2")
        .toLowerCase()
        .replace(/[äöüß]/gu, (c) => GERMAN[c])
        .normalize("NFD")
        .replace(/\p{M}/gu, "")
        .replace(/./gu, (c) => (c === "1" ? one : LOOK_ALIKES[c] ?? c))
        .split(/[^\p{L}\p{N}]+/u)
        .filter(Boolean);

/**
 * The deny list read once (autoValuesOf): each entry's words, joined, and how it matches.
 * @typedef {{ entry: string, text: string, words: number, whole: boolean }} DenyEntry
 */

/** Deny lists already read, by the list. */
const readDeny = new WeakMap();

/**
 * A deny list as deniedWord reads it, read once per list.
 * @param {readonly string[]} deny
 * @returns {DenyEntry[]}
 */
export function denyEntries(deny) {
    if (!readDeny.has(deny)) {
        readDeny.set(
            deny,
            deny
                // an entry with an umlaut also matches the name written without its dots ("Zustandig")
                .flatMap((entry) => {
                    const shown = entry.normalize("NFC").toLowerCase().trim();
                    const plain = shown.normalize("NFD").replace(/\p{M}/gu, "");
                    const whole = AUTO_VALUES_WHOLE_WORDS.includes(shown) || [...shown].length < 4;
                    return [...new Set([denyWords(shown).join(" "), denyWords(plain).join(" ")])].map((text) => ({ entry: shown, text, words: text.split(" ").length, whole }));
                })
                .filter((e) => e.text)
        );
    }
    return readDeny.get(deny);
}

/**
 * A name's words as deniedWord compares them: as read, and each run of words of one or two letters
 * glued ("DoB", "D.o.B." as "dob").
 */
function comparedWords(words) {
    const out = [...words];
    let run = "";
    for (const w of [...words, ""]) {
        if (w && w.length <= 2) {
            run += w;
        } else {
            if (run.length > 2) {
                out.push(run);
            }
            run = "";
        }
    }
    return out;
}

/**
 * The word of the deny list a field name holds, or null (see AUTO_VALUES_DENY for how each entry
 * matches). The name is read as denyWords reads it, once with "1" as "i" and once as "l"
 * ("Emp1oyee").
 * @param {string} name
 * @param {readonly string[]} deny
 */
export function deniedWord(name, deny) {
    for (const one of /** @type {const} */ (["i", "l"])) {
        const words = comparedWords(denyWords(name, one));
        const joined = ` ${words.join(" ")} `;
        const glued = words.join("");
        for (const e of denyEntries(deny)) {
            const hit =
                e.words > 1
                    ? joined.includes(` ${e.text} `) || joined.includes(` ${e.text}s `) || glued.includes(e.text.replace(/ /gu, ""))
                    : e.whole
                      ? words.some((t) => WORD_ENDINGS.some((end) => t === `${e.text}${end}`))
                      : words.some((t) => t.includes(e.text)) || ([...e.text].length >= 5 && glued.includes(e.text));
            if (hit) {
                return e.entry;
            }
        }
    }
    return null;
}

/**
 * The automatic rule for one text field: whether its statistics qualify it for "values", and why in
 * a few words (what check-config prints).
 * @param {string} name
 * @param {import("./stats.js").FieldStats} stat
 * @param {number} rows  the source's rows
 * @param {AutoValues} rule
 * @returns {{ values: boolean, why: string }}
 */
export function autoLevel(name, stat, rows, rule) {
    const no = (why) => ({ values: false, why });
    const word = deniedWord(name, rule.deny);
    if (word) {
        return no(`name matches the deny list ("${word}")`);
    }
    if (rows < rule.minRows) {
        return no(`${rows} rows < ${rule.minRows}`);
    }
    if (stat.distinct === 0) {
        return no("no values");
    }
    if (stat.distinct > rule.maxDistinct) {
        return no(`${stat.distinct} distinct > ${rule.maxDistinct}`);
    }
    if (stat.distinct * rule.rowsPerValue > rows) {
        return no(`${stat.distinct} distinct > rows / ${rule.rowsPerValue}`);
    }
    if (stat.minRows === undefined || stat.maxLength === undefined || stat.looks === undefined) {
        return no("no statistics");
    }
    if (stat.minRows < rule.minRowsPerValue) {
        return no(`a value in ${stat.minRows} row${stat.minRows === 1 ? "" : "s"} < ${rule.minRowsPerValue}`);
    }
    if (stat.maxLength > rule.maxLength) {
        return no(`a value longer than ${rule.maxLength} characters`);
    }
    if (stat.looks.length) {
        return no(`a value looks like ${LOOKS_TEXT[stat.looks[0]] ?? stat.looks[0]}`);
    }
    return { values: true, why: `auto: ${stat.distinct} distinct, min ${stat.minRows} rows` };
}

/**
 * A level as the data allows it: "values" only for a text field whose distinct values fit
 * (valuesMax, each at most NAME_TEXT characters) on a source that shows counts and rows, with the
 * statistics known; else "summary". Every other level as it is.
 * @returns {{ level: Level, why: string }}
 */
function listable(policy, key, level, why) {
    if (level !== "values") {
        return { level, why };
    }
    const stat = fieldStatsOf(policy.stats, key);
    const no = (reason) => ({ level: /** @type {Level} */ ("summary"), why: `values asked, but ${reason}` });
    if (!stat) {
        return no("the data's statistics are missing (or two columns share this name but for case or spaces)");
    }
    if (stat.type !== "string") {
        return no(`a ${stat.type} field lists no values`);
    }
    if (policy.counts === false || policy.rows === false) {
        return no(`${policy.counts === false ? "counts" : "rows"}: false (a list's length is its distinct count)`);
    }
    if (stat.distinct > policy.valuesMax) {
        return no(`${stat.distinct} distinct > valuesMax ${policy.valuesMax}`);
    }
    if (stat.maxLength === undefined || stat.maxLength > NAME_TEXT) {
        return no(`a value is longer than ${NAME_TEXT} characters`);
    }
    return { level, why };
}

/** Why a column the file gives no header is hidden (levelInfo). */
export const UNNAMED_WHY = "the file gives this column no header";

/**
 * A field's level with why, and whether the automatic rule gave it: its own rule, else "hide" for a
 * column the file gives no header (policy.unnamed: the reader named it "Column N"; "summary" would
 * still put its values into a rendered file), else "hide" for a column the reader renamed because
 * its header repeats a hidden one ("Email (2)" next to "Email"), else the automatic rule, else the
 * default. "values" falls back to "summary" where the data does
 * not allow it (listable), and needs the statistics (withStats).
 * @param {{ default: string, fields: Map<string, string>, unnamed?: ReadonlySet<string>, auto?: AutoValues | false, stats?: import("./stats.js").SourceStats | null, counts?: boolean, rows?: boolean, valuesMax?: number }} policy  unnamed: the keys (fieldKey) of the columns the file gives no header
 * @param {string} name
 * @returns {{ level: Level, why: string, auto?: true }}
 */
export function levelInfo(policy, name) {
    const p = /** @type {any} */ (policy);
    const key = fieldKey(name);
    const own = p.fields.get(key);
    if (own) {
        return listable(p, key, own, "a rule");
    }
    if (p.unnamed?.has(key)) {
        return { level: "hide", why: UNNAMED_WHY };
    }
    const base = REPEATED.exec(key)?.[1];
    if (base !== undefined && (p.fields.get(base) ?? p.default) === "hide") {
        return { level: "hide", why: "repeats a hidden column's header" };
    }
    const stat = fieldStatsOf(p.stats, key);
    if (p.auto && stat && stat.type !== "string") {
        return listable(p, key, p.default, `a ${stat.type} field (the automatic rule is for text)`);
    }
    if (p.auto && stat?.type === "string") {
        const verdict = autoLevel(name, stat, p.stats.rows, p.auto);
        if (verdict.values) {
            const listed = listable(p, key, "values", verdict.why);
            return listed.level === "values" ? { ...listed, auto: true } : listed;
        }
        return { ...listable(p, key, p.default, verdict.why) };
    }
    return listable(p, key, p.default, "the default");
}

/** Whether any field of a policy can be at "values": a rule or the default names it, or the automatic rule is on. */
export const mayList = (policy) => Boolean(policy.auto) || policy.default === "values" || [...policy.fields.values()].includes("values");

/**
 * A field's level (levelInfo's, without why).
 * @param {{ default: string, fields: Map<string, string>, auto?: AutoValues | false, stats?: import("./stats.js").SourceStats | null, counts?: boolean, rows?: boolean, valuesMax?: number }} policy
 * @param {string} name
 * @returns {Level}
 */
export const levelOf = (policy, name) => levelInfo(policy, name).level;

/**
 * Whether describe_source lists every value of a field under the policy: a "values" field always, a
 * "show" field (not a date, which lists none) whose distinct values fit policy.items, where counts
 * are shown.
 * @param {Policy} policy
 * @param {string} name
 */
export function listsAll(policy, name) {
    const level = levelOf(policy, name);
    if (level === "values") {
        return true;
    }
    const stat = fieldStatsOf(policy.stats, fieldKey(name));
    return level === "show" && policy.counts !== false && Boolean(stat) && stat?.type !== "date" && /** @type {any} */ (stat).distinct <= policy.items;
}

/** The grouping a draft gives a date field whose span is not shown: the same for every span. */
export const CLOSED_DATE_GROUPING = "yearQuarter";

/**
 * What a draft (suggest_view, a layout) may read of a source's description under a policy's levels:
 * what describe_source shows. A field that is not "show" loses its smallest and largest value (a
 * date gets CLOSED_DATE_GROUPING instead of a grouping by its span) and keeps its counts, which
 * describe_source reports at every level; counts go where `counts` is false, the row count where
 * `rows` is false. A shown date keeps its span.
 * @param {{ default: string, fields: Record<string, string>, counts?: boolean, rows?: boolean }} levels
 */
export function draftingOf(levels) {
    const policy = { default: levels.default, fields: new Map(Object.entries(levels.fields)) };
    return (description) => ({
        rows: levels.rows === false ? null : description.rows,
        fields: description.fields.map((f) => {
            const { distinct, blanks, min, max, ...rest } = f;
            const counts = levels.counts === false ? {} : { distinct, blanks };
            if (levelOf(policy, f.name) !== "show") {
                return { ...rest, ...counts, ...(f.type === "date" ? { by: CLOSED_DATE_GROUPING } : {}) };
            }
            return { ...rest, ...counts, min, max };
        })
    });
}

/** The names of a table's columns the policy hides (dropped before anything else sees the data). */
export const hiddenColumns = (policy, columns) => columns.filter((c) => levelOf(policy, c) === "hide");

/** A field's name as the model sees it: cleaned and capped. */
const nameText = (name) => {
    const clean = findingText(name);
    return clean.length > NAME_TEXT ? `${clean.slice(0, NAME_TEXT - 1)}…` : clean;
};

/** The order a "values" list is given in: by code points, the same on every machine. */
const byText = (a, b) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0);

/**
 * What describe_source keeps back under a policy, in fixed words (never a name or a value): "values"
 * where a field lists none of its values, "rows" and "counts" where those are off.
 * @param {Array<{ level: string }>} fields
 * @param {Policy} policy
 */
const withheldOf = (fields, policy) => [...(fields.some((f) => f.level === "summary") ? ["values"] : []), ...(policy.rows === false ? ["rows"] : []), ...(policy.counts === false ? ["counts"] : [])];

/** One sentence for what describe_source keeps back. */
export const DESCRIBE_HINT = "A field at summary lists no values: ask the user for the exact item to filter on. Only the operator can show more (policy).";

/**
 * describe_source's result as the policy allows: each field with its level; for a "show" field its
 * first values (policy.items) and smallest and largest, with `complete` saying whether those are all;
 * for a "values" field every distinct value, sorted, `complete: true`, and `auto: true` where the
 * automatic rule gave the level; counts only when allowed; the text rebuilt from what is left (no
 * value in it). `withheld` and `hint` say what is kept back.
 * @param {any} result  describe_source's result (asked with items = max(policy.items, policy.valuesMax))
 * @param {Policy} policy  with the data's statistics (withStats)
 * @param {number} hidden  the number of columns dropped
 * @param {Map<string, string>} [descriptions]  the operator's words about fields, by fieldKey (sources.<id>.fields.<name>.description), shown at every level
 */
export function exposeSource(result, policy, hidden, descriptions = undefined) {
    const fields = result.fields.map((f) => {
        const info = levelInfo(policy, f.name);
        const level = info.level;
        const name = nameText(f.name);
        /** @type {Record<string, unknown>} */
        const out = { name, type: f.type, level, ...(info.auto ? { auto: true } : {}) };
        const description = descriptions?.get(fieldKey(f.name));
        if (description) {
            out.description = description;
        }
        if (policy.counts && f.distinct !== undefined) {
            out.distinct = f.distinct;
            out.blanks = f.blanks;
        }
        if (level === "show") {
            // a date's first values say little: its smallest and largest stand for it
            if (f.items && f.type !== "date") {
                out.items = f.items.slice(0, policy.items).map((v) => (typeof v === "string" ? nameText(v) : v));
                if (policy.counts && f.distinct !== undefined) {
                    out.complete = f.distinct <= policy.items;
                }
            }
            if (f.min !== undefined) {
                out.min = typeof f.min === "string" ? nameText(f.min) : f.min;
                out.max = typeof f.max === "string" ? nameText(f.max) : f.max;
            }
        }
        if (level === "values") {
            // levelInfo gives "values" only where every value fits in the list (listable)
            out.items = (f.items ?? []).slice(0, policy.valuesMax).map((v) => nameText(v)).sort(byText);
            out.complete = true;
        }
        out.aggregators = f.aggregators;
        out.filters = f.filters;
        out.text = `${name}: ${f.type}, ${level}${out.distinct !== undefined ? `, ${out.distinct} distinct, ${out.blanks} blank` : ""}`;
        return out;
    });
    const rows = policy.rows ? result.rows : null;
    const withheld = withheldOf(fields, policy);
    return {
        rows,
        fields,
        hiddenFields: hidden,
        text: `${rows === null ? "" : `${rows} rows, `}${fields.length} fields${hidden ? ` (${hidden} more hidden by the operator)` : ""}`,
        examples: result.examples,
        notes: (result.notes ?? []).filter((n) => n.severity !== "info"),
        ...(withheld.length ? { withheld, hint: DESCRIBE_HINT } : {})
    };
}

/**
 * Whether a view that uses these fields touches one whose results the model may not see: any field
 * that is not "show" ("values" lists a field's values, never a result over them).
 */
export const touchesClosed = (policy, uses) => (uses ?? []).some((f) => levelOf(policy, f) !== "show");

/**
 * Findings about one field's items, by the finding's `field`: an item spelt differently (itemCase)
 * for a "show" or "values" field; an item that is none of the listed values (itemUnknown) for a field
 * whose values describe_source lists completely (listsAll). A finding without `field` is left out.
 */
const FIELD_FINDINGS = Object.freeze({
    itemCase: (policy, field) => ["show", "values"].includes(levelOf(policy, field)),
    itemUnknown: (policy, field) => listsAll(policy, field)
});

/**
 * Findings about the whole view's result that would tell whether rows exist (a filter that keeps
 * nothing, a cut table or chart): only for a view whose fields are all "show". "values" does not
 * unlock them: an empty combination of two listed values would tell whether that combination exists.
 */
const VIEW_FINDINGS = new Set(["filterEmpty", "noRowsKept", "chartCut", "tableCut"]);

/**
 * Findings as the policy allows: a finding about a field's items as FIELD_FINDINGS says, a finding
 * about the view's result (VIEW_FINDINGS) only where every field is shown; notes of how a file was
 * read ("info") are left out. A finding that names a hidden column keeps only its code.
 * @param {Array<{ severity: string, code: string, path?: string, message: string, suggestion?: string, field?: string }>} findings
 * @param {Policy} policy  with the data's statistics (withStats)
 * @param {string[]} uses
 * @param {string[]} [hidden]  the hidden columns' names
 */
export function exposeFindings(findings, policy, uses, hidden = []) {
    const closed = touchesClosed(policy, uses);
    const lower = hidden.map(fieldKey).filter(Boolean);
    const names = (f) => [f.message, f.suggestion, f.field].filter((t) => t !== undefined).map(fieldKey);
    return findings
        // a reader's note of how it read the file (its encoding, its separator) is no help to the model
        .filter((f) => f.severity !== "info")
        .filter((f) => (Object.hasOwn(FIELD_FINDINGS, f.code) ? typeof f.field === "string" && f.field !== "" && FIELD_FINDINGS[f.code](policy, f.field) : !(closed && VIEW_FINDINGS.has(f.code))))
        .map((f) => (lower.some((h) => names(f).some((t) => t.includes(h))) ? { severity: f.severity, code: f.code, path: "", message: f.code } : f));
}

// The package loaded twice from two places (two copies with their own modules, as two scripts of a
// page may bring them): the second copy leaves <pivot-report> alone, and define() of either copy
// takes other names.
const first = await import(new URL("../packages/pivotkit-element/dist/index.js", location.href).href);
const second = await import(new URL("./element-copy/index.js", location.href).href);
window.__twice = {
    differentModules: first.PivotReportElement !== second.PivotReportElement,
    sameDefinition: customElements.get("pivot-report") === first.PivotReportElement,
    again: second.define() === first.PivotReportElement,
    custom: second.define("my-pivot") !== undefined && customElements.get("my-pivot") !== undefined,
    // the first copy's class is defined already: another name gets a subclass, no error
    customFirst: first.define("my-other-pivot") !== first.PivotReportElement
};
const el = document.createElement("my-pivot");
el.data = [{ Team: "A", Hours: 2 }, { Team: "B", Hours: 3 }];
el.defaultView = { rows: ["Team"], values: [{ field: "Hours", agg: "sum" }] };
document.body.append(el);

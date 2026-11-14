import {test} from "node:test";
import assert from "node:assert/strict";
import {compareText,yearText} from "../src/names.js";
import {yearRules, quickChoice} from "../src/menu-ops.js";
import {resolveLabels} from "../src/labels.js";
import {menuLabels} from "../src/menu-labels.js";

test("expanded bounds are chronological, including whole years and BCE (#97)", () => {
    const labels = menuLabels(resolveLabels("en-US"));
    for (const op of ["between", "notBetween"]) {
        for (const [a,b] of [["9999-01-01", "+010000-12-31"], ["-000002-01-01", "-000001-12-31"], ["9999-02-01", "+010000-11-30"]]) {
            const forward = compareText({op,value:a,value2:b},labels,"en-US",{date:true});
            const reverse = compareText({op,value:b,value2:a},labels,"en-US",{date:true});
            assert.equal(forward,reverse);
            assert.ok(forward.indexOf(yearText(Number(a.slice(0,-6)),"en-US")) < forward.indexOf(yearText(Number(b.slice(0,-6)),"en-US")) || !a.endsWith("01-01"));
        }
    }
});

test("Years combined emits canonical signed dates and reads the selection back (#97)", () => {
    const all = [-2,-1,0,9999,10000];
    const filters = yearRules("Date", [-1,10000], all);
    assert.equal(filters[0].value,"-000001-01-01");
    assert.equal(filters[0].value2,"+010000-12-31");
    assert.deepEqual(quickChoice({filters},"Date",{cyclic:true},all).years,[-1,10000]);
});


test("Years combined clamps partial Date boundary years and survives normalization (#97)", async () => {
    const {encode, normalize, computePivot} = await import("pivotkit-core");
    const {setYearsCombined} = await import("../src/menu-ops.js");
    const all = [-271821, 2024, 275760];
    const field = "Date (Month)";
    const {groupField} = await import("../src/view-ops.js");
    const data = encode({columns:["Date"], types:["date"], data:[[-8.64e15, Date.UTC(2024,0,1), 8.64e15]]});
    for (const [years, from, to] of [
        [[-271821], "-271821-04-20", "-271821-12-31"],
        [[275760], "+275760-01-01", "+275760-09-13"],
        [[-271821,275760], "-271821-04-20", "+275760-09-13"]
    ]) {
        const base = normalize(groupField(normalize({rows:["Date"],values:[{agg:"count"}]},data).view,"Date","month",{name:field}).view,data).view;
        const view = {...base, filters:yearRules(field,years,all)};
        assert.equal(view.filters[0].value,from);
        assert.equal(view.filters[0].value2,to);
        assert.deepEqual(normalize(view,data).issues,[]);
        assert.deepEqual(quickChoice(view,field,{cyclic:true},all).years,years);
        assert.equal(computePivot(data,view).rowRoot.children.length,years.length);
        assert.deepEqual(setYearsCombined(view,field,all,all).filters,[]);
    }
});

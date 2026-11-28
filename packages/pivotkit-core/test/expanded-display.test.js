import {test} from "node:test";
import assert from "node:assert/strict";
import {encode, computePivot, toGrid} from "../src/index.js";
import {toCsv} from "../src/export.js";
const data=encode([{Date:"-000001-01-11"},{Date:"0002-01-08"},{Date:"+010000-02-29"}]);
test("BCE dimensions and grouped month/quarter/week labels remain distinct",()=>{
    const result=computePivot(data,{rows:["Date"],values:[{agg:"count"}]});
    const labels=result.rowRoot.children.map(n=>result.label("rows",n));
    assert.match(labels[0],/BC/); assert.notEqual(labels[0], labels[1]);
    for(const [by,expected] of [["yearMonth",/Jan.*2 BC/],["yearQuarter",/^Q1 2 BC$/],["yearWeek",/^2 BC-W02$/]]) {
        const r=computePivot(data,{rows:["G"],derived:[{name:"G",field:"Date",by}],values:[{agg:"count"}]});
        assert.match(r.label("rows",r.rowRoot.children[0]),expected);
    }
});
test("CSV aggregate date values preserve the canonical signed ISO day",()=>{
    for(const date of ["+010000-02-29","-000001-01-01"]) {
        const r=computePivot(encode([{Date:date}]),{values:[{field:"Date",agg:"max"}]});
        assert.ok(toCsv(toGrid(r)).includes(date));
        if (date.startsWith("-")) assert.match(JSON.stringify(toGrid(r)), /BC/);
    }
});

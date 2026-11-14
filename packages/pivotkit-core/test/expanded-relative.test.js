import { test } from "node:test";
import assert from "node:assert/strict";
import { encode, normalize, computePivot, relativeDateRange, suggestLayout } from "../src/index.js";

test("expanded relative anchors retain seconds and return complete minute bounds", () => {
    const anchor = "+010000-02-29T12:34:56";
    const data = encode([{Date: "+010000-02-29T12:34:40"}]);
    const {view} = normalize({filters:[{field:"Date",type:"relative",unit:"hour",count:1,calendar:false,anchor}]},data);
    assert.equal(view.filters[0].anchor, anchor);
    assert.equal(computePivot(data,view).rows.length,1);
    assert.deepEqual(relativeDateRange("hour",1,{direction:"this",anchor}),{from:"+010000-02-29T12:00",to:"+010000-02-29T12:59"});
});

test("negative-zero description years cannot fabricate a suggested date span", () => {
    const suggestion = (min) => suggestLayout({rows:2,fields:[{name:"Date",type:"date",distinct:2,min,max:"2024-12-31"},{name:"Amount",type:"number",distinct:2,min:1,max:2}]});
    assert.deepEqual(suggestion("-000000-01-01"), suggestion("not-a-date"));
});

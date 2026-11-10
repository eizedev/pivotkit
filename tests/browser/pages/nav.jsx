// pivotkit-react in a host page with a fixed left navigation and an app bar above the report's z-index
// (nav-shell.js), with React from the import map as PowerShell Universal provides it. ?rows= the
// number of servers (default 2,000), ?view= the start view (nav-shell.js VIEWS), ?lang=de a German
// report, ?two a second report under the first (names of form fields per report).
import React from "react";
import { createRoot } from "react-dom/client";
import { PivotReport } from "pivotkit-react";
import { VIEWS, hostFrame, servers } from "./nav-shell.js";

const query = new URLSearchParams(location.search);
const rows = servers(Number(query.get("rows")) || 2000);
const view = VIEWS[query.get("view") ?? "basic"];
const locale = query.get("lang") === "de" ? "de-DE" : "en-US";

const main = hostFrame("Servers");
const reports = query.has("two") ? ["one", "two"] : ["one"];
createRoot(main).render(
    <>
        {reports.map((id) => (
            <div key={id} id={id} style={{ marginBottom: 16 }}>
                <PivotReport data={rows} dataKey="servers" defaultView={view} height={640} locale={locale} />
            </div>
        ))}
    </>
);

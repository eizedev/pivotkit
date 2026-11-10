// The web component in a host page with a fixed left navigation and an app bar (nav-shell.js):
// ?rows= the number of servers (default 2,000), ?view= the start view, ?two a second element.
import { VIEWS, hostFrame, servers } from "../nav-shell.js";

const query = new URLSearchParams(location.search);
const rows = servers(Number(query.get("rows")) || 2000);
const view = VIEWS[query.get("view") ?? "basic"];
const main = hostFrame("Servers");
for (const id of query.has("two") ? ["one", "two"] : ["one"]) {
    const el = document.createElement("pivot-report");
    el.id = id;
    el.setAttribute("height", "640");
    el.data = rows;
    if (view) {
        el.defaultView = view;
    }
    main.append(el);
}

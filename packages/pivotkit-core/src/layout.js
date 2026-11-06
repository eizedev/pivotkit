/*
 * The visible lines of a pivot axis, shared by the grid and the chart. Not part of the public API.
 */

function pathKey(path) {
    return JSON.stringify(path);
}

/**
 * The visible lines of an axis in display order: leaves, collapsed groups, subtotals after their
 * children and the grand total last.
 * @param {import("./tree.js").PivotNode} root
 * @param {number} depth  number of fields on the axis
 * @param {any[][]} collapsedPaths
 * @param {boolean} subtotals
 * @param {boolean} grandTotal
 * @returns {Array<{ node: import("./tree.js").PivotNode, kind: "leaf" | "collapsed" | "subtotal" | "grand" }>}
 */
export function axisLines(root, depth, collapsedPaths, subtotals, grandTotal) {
    const collapsed = new Set(collapsedPaths.map(pathKey));
    const lines = [];
    if (depth === 0) {
        lines.push({ node: root, kind: "leaf" });
        return lines;
    }
    const visit = (node) => {
        if (node.children.length === 0) {
            lines.push({ node, kind: "leaf" });
            return;
        }
        if (collapsed.has(pathKey(node.path))) {
            lines.push({ node, kind: "collapsed" });
            return;
        }
        node.children.forEach(visit);
        if (subtotals) {
            lines.push({ node, kind: "subtotal" });
        }
    };
    root.children.forEach(visit);
    if (grandTotal || lines.length === 0) {
        lines.push({ node: root, kind: "grand" });
    }
    return lines;
}

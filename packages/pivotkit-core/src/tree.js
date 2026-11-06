/*
 * Key trees of the pivot axes. Every tree node is a group: the root is the grand total, inner nodes
 * are subtotals, leaves the deepest keys.
 */

/**
 * @typedef {object} PivotNode
 * @property {number} id
 * @property {number} depth      0 for the root (grand total)
 * @property {number} code       dictionary code of its key, -1 for blank, -2 for the root
 * @property {string | number | boolean | null} key  raw key value (null for blank and the root)
 * @property {Array<string | number | boolean | null>} path  keys from the top level down
 * @property {PivotNode | null} parent
 * @property {PivotNode[]} children  in display (sorted) order
 * @property {number} index      position among its siblings
 */

/**
 * Groups rows by the codes of some columns.
 * @param {import("./encode.js").Column[]} columns
 * @param {Int32Array} rows  source row indices
 * @returns {{ groupOf: Int32Array, paths: number[][] }}  groupOf is indexed by position in rows
 */
export function groupBy(columns, rows) {
    const groupOf = new Int32Array(rows.length);
    const paths = [];
    if (columns.length === 0) {
        paths.push([]);
        return { groupOf, paths };
    }
    let product = 1;
    for (const c of columns) {
        product *= c.dict.length + 1;
    }
    // one number per key while the product of the radices fits a double exactly, else a string
    const numeric = product < 2 ** 52;
    const map = new Map();
    const k = columns.length;
    const codeArrays = columns.map((c) => c.codes);
    const radices = columns.map((c) => c.dict.length + 1);
    for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        let key;
        if (numeric) {
            key = 0;
            for (let j = 0; j < k; j++) {
                key = key * radices[j] + codeArrays[j][r] + 1;
            }
        } else {
            key = "";
            for (let j = 0; j < k; j++) {
                key += codeArrays[j][r] + ",";
            }
        }
        let g = map.get(key);
        if (g === undefined) {
            g = paths.length;
            const path = new Array(k);
            for (let j = 0; j < k; j++) {
                path[j] = codeArrays[j][r];
            }
            paths.push(path);
            map.set(key, g);
        }
        groupOf[i] = g;
    }
    return { groupOf, paths };
}

function makeNode(id, depth, code, key, parent) {
    return {
        id,
        depth,
        code,
        key,
        path: parent ? [...parent.path, key] : [],
        parent,
        children: [],
        index: 0
    };
}

/**
 * Builds the key tree of an axis.
 * @param {import("./encode.js").Column[]} columns
 * @param {Int32Array} rows
 * @returns {{ root: PivotNode, nodes: PivotNode[], leafOf: Int32Array }}  leafOf: leaf node id per row position
 */
export function buildTree(columns, rows) {
    const { groupOf, paths } = groupBy(columns, rows);
    const root = makeNode(0, 0, -2, null, null);
    const nodes = [root];
    const childMaps = [new Map()];
    const leafOfGroup = new Array(paths.length);
    paths.forEach((path, g) => {
        let node = root;
        for (let level = 0; level < path.length; level++) {
            const code = path[level];
            const map = childMaps[node.id];
            let child = map.get(code);
            if (child === undefined) {
                const key = code === -1 ? null : columns[level].dict[code];
                child = makeNode(nodes.length, level + 1, code, key, node);
                nodes.push(child);
                childMaps.push(new Map());
                map.set(code, child);
                node.children.push(child);
            }
            node = child;
        }
        leafOfGroup[g] = node;
    });
    const leafOf = new Int32Array(rows.length);
    for (let i = 0; i < rows.length; i++) {
        leafOf[i] = leafOfGroup[groupOf[i]].id;
    }
    return { root, nodes, leafOf };
}

const sameKey = (a, b) => a === b || (a === null && b === null) || (typeof a === "number" && typeof b === "number" && Number.isNaN(a) && Number.isNaN(b));

/**
 * The node of an axis for a key path ([] is the grand total); null when there is none.
 * @param {import("./pivot.js").PivotResult} result
 * @param {"rows" | "cols"} axis
 * @param {Array<string | number | boolean | null>} path
 * @returns {PivotNode | null}
 */
export function findNode(result, axis, path) {
    let node = axis === "cols" ? result.colRoot : result.rowRoot;
    for (const key of path || []) {
        node = node.children.find((c) => sameKey(c.key, key));
        if (!node) {
            return null;
        }
    }
    return node;
}

/**
 * The source row indices behind a cell (drill-down), in data order.
 * @param {import("./pivot.js").PivotResult} result
 * @param {{ row?: PivotNode | Array<any>, col?: PivotNode | Array<any> }} [options]  a node or key
 *   path per axis; omitted or [] for all rows
 * @returns {Int32Array}
 */
export function cellRows(result, options = {}) {
    const { row = [], col = [] } = options;
    const rowNode = Array.isArray(row) ? findNode(result, "rows", row) : row;
    const colNode = Array.isArray(col) ? findNode(result, "cols", col) : col;
    if (!rowNode || !colNode) {
        return new Int32Array(0);
    }
    const under = (nodes, leafId, target) => {
        let n = nodes[leafId];
        while (n && n.depth > target.depth) {
            n = n.parent;
        }
        return n === target;
    };
    const out = [];
    for (let i = 0; i < result.rows.length; i++) {
        if (under(result.rowNodes, result.rowLeafOf[i], rowNode) && under(result.colNodes, result.colLeafOf[i], colNode)) {
            out.push(result.rows[i]);
        }
    }
    return Int32Array.from(out);
}

/**
 * The room of the table's row label columns (#584). A table that fits its box keeps its labels at
 * their natural width. A wider one caps them: table.jsx measures how much room the value columns
 * leave, and this is the one cap that shares it out.
 */

/**
 * The widest each label may be so that the labels together take `room`: short ones keep their width,
 * long ones share what the short ones leave. Infinity when all of them fit, 0 when there is no room.
 * @param {number[]} widths the natural width of each label column
 * @param {number} room the width the columns may take together
 * @returns {number}
 */
export function commonCap(widths, room) {
    if (room <= 0) {
        return 0;
    }
    const sorted = [...widths].sort((a, b) => a - b);
    let left = room;
    for (let i = 0; i < sorted.length; i++) {
        const share = left / (sorted.length - i);
        if (sorted[i] > share) {
            return share;
        }
        left -= sorted[i];
    }
    return Infinity;
}

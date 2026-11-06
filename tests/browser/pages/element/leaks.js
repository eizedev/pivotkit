// Counts what is registered on the document and the window (event listeners) and every observer that
// observes, before the package loads (a classic script, see leaks.html): window.__live() is the number
// still active. The test mounts and unmounts the element several times and compares.
(function () {
    const listeners = new Set();
    const key = (target, type, fn, options) => [target === document ? "document" : target === window ? "window" : null, type, fn, typeof options === "boolean" ? options : Boolean(options && options.capture)];
    const find = (k) => [...listeners].find((e) => e[0] === k[0] && e[1] === k[1] && e[2] === k[2] && e[3] === k[3]);
    const add = EventTarget.prototype.addEventListener;
    const remove = EventTarget.prototype.removeEventListener;
    EventTarget.prototype.addEventListener = function (type, fn, options) {
        const k = key(this, type, fn, options);
        if (k[0] && fn && !find(k)) listeners.add(k);
        return add.call(this, type, fn, options);
    };
    EventTarget.prototype.removeEventListener = function (type, fn, options) {
        const k = key(this, type, fn, options);
        const found = k[0] && find(k);
        if (found) listeners.delete(found);
        return remove.call(this, type, fn, options);
    };
    const observing = new Set();
    for (const name of ["MutationObserver", "ResizeObserver", "IntersectionObserver"]) {
        const proto = window[name] && window[name].prototype;
        if (!proto) continue;
        const observe = proto.observe;
        const disconnect = proto.disconnect;
        proto.observe = function (...args) {
            observing.add(this);
            return observe.apply(this, args);
        };
        proto.disconnect = function () {
            observing.delete(this);
            return disconnect.call(this);
        };
    }
    window.__live = () => ({ listeners: [...listeners].map((e) => `${e[0]}:${e[1]}`).sort(), observers: observing.size });
})();

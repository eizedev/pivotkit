// A browser without constructable stylesheets, as far as the element can tell (a classic script that
// runs before the package, see fallback.html): replaceSync() is gone, so the element falls back to a
// <style> element in its shadow root.
delete CSSStyleSheet.prototype.replaceSync;

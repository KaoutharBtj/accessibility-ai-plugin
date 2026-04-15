"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.debounce = debounce;
function debounce(fn, delayMs) {
    let timer = null;
    const debounced = (arg) => {
        if (timer)
            clearTimeout(timer);
        timer = setTimeout(() => {
            timer = null;
            fn(arg).catch(console.error);
        }, delayMs);
    };
    debounced.flush = async (arg) => {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        await fn(arg);
    };
    return debounced;
}
//# sourceMappingURL=utils.js.map
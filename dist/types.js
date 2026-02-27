"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TradeError = void 0;
// ─── Trade error (augmented with Steam error info) ────────────────────────────
class TradeError extends Error {
    eresult;
    cause;
    body;
    constructor(message) {
        super(message);
        this.name = 'TradeError';
    }
}
exports.TradeError = TradeError;
//# sourceMappingURL=types.js.map
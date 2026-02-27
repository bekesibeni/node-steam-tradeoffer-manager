"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ETradeOfferState = void 0;
var ETradeOfferState;
(function (ETradeOfferState) {
    ETradeOfferState[ETradeOfferState["Invalid"] = 1] = "Invalid";
    ETradeOfferState[ETradeOfferState["Active"] = 2] = "Active";
    ETradeOfferState[ETradeOfferState["Accepted"] = 3] = "Accepted";
    ETradeOfferState[ETradeOfferState["Countered"] = 4] = "Countered";
    ETradeOfferState[ETradeOfferState["Expired"] = 5] = "Expired";
    ETradeOfferState[ETradeOfferState["Canceled"] = 6] = "Canceled";
    ETradeOfferState[ETradeOfferState["Declined"] = 7] = "Declined";
    ETradeOfferState[ETradeOfferState["InvalidItems"] = 8] = "InvalidItems";
    ETradeOfferState[ETradeOfferState["CreatedNeedsConfirmation"] = 9] = "CreatedNeedsConfirmation";
    ETradeOfferState[ETradeOfferState["CanceledBySecondFactor"] = 10] = "CanceledBySecondFactor";
    ETradeOfferState[ETradeOfferState["InEscrow"] = 11] = "InEscrow";
    /** Trade was reverted by the user (Trade protection update 2025) */
    ETradeOfferState[ETradeOfferState["Reverted"] = 12] = "Reverted";
})(ETradeOfferState || (exports.ETradeOfferState = ETradeOfferState = {}));
//# sourceMappingURL=ETradeOfferState.js.map
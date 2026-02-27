"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ETradeStatus = void 0;
var ETradeStatus;
(function (ETradeStatus) {
    ETradeStatus[ETradeStatus["Init"] = 0] = "Init";
    ETradeStatus[ETradeStatus["PreCommitted"] = 1] = "PreCommitted";
    ETradeStatus[ETradeStatus["Committed"] = 2] = "Committed";
    ETradeStatus[ETradeStatus["Complete"] = 3] = "Complete";
    ETradeStatus[ETradeStatus["Failed"] = 4] = "Failed";
    ETradeStatus[ETradeStatus["PartialSupportRollback"] = 5] = "PartialSupportRollback";
    ETradeStatus[ETradeStatus["FullSupportRollback"] = 6] = "FullSupportRollback";
    ETradeStatus[ETradeStatus["SupportRollback_Selective"] = 7] = "SupportRollback_Selective";
    ETradeStatus[ETradeStatus["RollbackFailed"] = 8] = "RollbackFailed";
    ETradeStatus[ETradeStatus["RollbackAbandoned"] = 9] = "RollbackAbandoned";
    ETradeStatus[ETradeStatus["InEscrow"] = 10] = "InEscrow";
    ETradeStatus[ETradeStatus["EscrowRollback"] = 11] = "EscrowRollback";
    /** Trade was reverted by the user (Trade protection update 2025) */
    ETradeStatus[ETradeStatus["Reverted"] = 12] = "Reverted";
})(ETradeStatus || (exports.ETradeStatus = ETradeStatus = {}));
//# sourceMappingURL=ETradeStatus.js.map
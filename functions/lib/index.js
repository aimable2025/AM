"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bootstrapSystemAdmin = void 0;
const app_1 = require("firebase-admin/app");
const firebase_functions_1 = require("firebase-functions");
const bootstrapAdmin_1 = require("./admin/bootstrapAdmin");
Object.defineProperty(exports, "bootstrapSystemAdmin", { enumerable: true, get: function () { return bootstrapAdmin_1.bootstrapSystemAdmin; } });
(0, app_1.initializeApp)();
(0, firebase_functions_1.setGlobalOptions)({
    maxInstances: 10,
});
//# sourceMappingURL=index.js.map
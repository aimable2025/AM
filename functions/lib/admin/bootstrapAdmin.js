"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bootstrapSystemAdmin = void 0;
const auth_1 = require("firebase-admin/auth");
const firestore_1 = require("firebase-admin/firestore");
const params_1 = require("firebase-functions/params");
const https_1 = require("firebase-functions/v2/https");
const logger_1 = require("firebase-functions/logger");
const SYSTEM_ADMIN_BOOTSTRAP_EMAIL = (0, params_1.defineString)("SYSTEM_ADMIN_BOOTSTRAP_EMAIL");
const auth = (0, auth_1.getAuth)();
const db = (0, firestore_1.getFirestore)();
const ADMIN_ROLE = "administrateur_systeme";
const ADMIN_CATEGORY = "direction";
exports.bootstrapSystemAdmin = (0, https_1.onCall)({
    region: "africa-south1",
    maxInstances: 1,
}, async (request) => {
    var _a;
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Authentification requise.");
    }
    const callerUid = request.auth.uid;
    const callerUser = await auth.getUser(callerUid);
    /*
     * Le bootstrap ne peut être exécuté qu'une seule fois.
     */
    const existingAdminQuery = await db
        .collection("users")
        .where("role", "==", ADMIN_ROLE)
        .limit(1)
        .get();
    if (!existingAdminQuery.empty) {
        logger_1.logger.warn("Tentative de bootstrap après verrouillage.", { callerUid });
        throw new https_1.HttpsError("failed-precondition", "Le bootstrap de l'Administrateur Système est déjà verrouillé.");
    }
    const configuredEmail = SYSTEM_ADMIN_BOOTSTRAP_EMAIL.value().trim().toLowerCase();
    if (!callerUser.email ||
        callerUser.email.trim().toLowerCase() !== configuredEmail) {
        logger_1.logger.warn("Compte non autorisé pour le bootstrap.", {
            callerUid,
            email: (_a = callerUser.email) !== null && _a !== void 0 ? _a : null,
        });
        throw new https_1.HttpsError("permission-denied", "Ce compte n'est pas autorisé à effectuer le bootstrap.");
    }
    const now = new Date().toISOString();
    /*
     * Attribution des privilèges Firebase côté serveur.
     */
    await auth.setCustomUserClaims(callerUid, {
        admin: true,
        role: ADMIN_ROLE,
        category: ADMIN_CATEGORY,
    });
    /*
     * Création du profil applicatif.
     */
    await db.collection("users").doc(callerUid).set({
        uid: callerUid,
        displayName: callerUser.displayName ||
            "Administrateur Système",
        email: callerUser.email,
        photoURL: callerUser.photoURL || null,
        category: ADMIN_CATEGORY,
        role: ADMIN_ROLE,
        function: null,
        agencyId: null,
        status: "active",
        isApproved: true,
        permissions: [
            "system.manage",
            "users.manage",
            "roles.manage",
            "permissions.manage",
            "firestore.manage",
            "firebase.manage",
            "security.manage",
            "backup.manage",
            "sync.manage",
            "audit.read",
            "dg_features.manage",
        ],
        createdAt: firestore_1.FieldValue.serverTimestamp(),
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
        bootstrapCompletedAt: now,
    }, {
        merge: true,
    });
    /*
     * Journal de sécurité.
     */
    await db.collection("auditLogs").add({
        actorId: callerUid,
        actorRole: ADMIN_ROLE,
        action: "SYSTEM_ADMIN_BOOTSTRAP",
        resource: "system_admin",
        resourceId: callerUid,
        timestamp: firestore_1.FieldValue.serverTimestamp(),
        environment: "production",
        source: "cloud_function",
    });
    logger_1.logger.info("Administrateur Système initialisé.", { uid: callerUid });
    return {
        success: true,
        message: "Administrateur Système initialisé avec succès.",
    };
});
//# sourceMappingURL=bootstrapAdmin.js.map
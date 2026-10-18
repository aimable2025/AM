import {getAuth} from "firebase-admin/auth";
import {
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";
import {defineString} from "firebase-functions/params";
import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";
import {logger} from "firebase-functions/logger";

const SYSTEM_ADMIN_BOOTSTRAP_EMAIL = defineString(
  "SYSTEM_ADMIN_BOOTSTRAP_EMAIL",
);

const auth = getAuth();
const db = getFirestore();

const ADMIN_ROLE = "administrateur_systeme";
const ADMIN_CATEGORY = "direction";

export const bootstrapSystemAdmin = onCall(
  {
    region: "africa-south1",
    maxInstances: 1,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Authentification requise.",
      );
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
      logger.warn(
        "Tentative de bootstrap après verrouillage.",
        {callerUid},
      );

      throw new HttpsError(
        "failed-precondition",
        "Le bootstrap de l'Administrateur Système est déjà verrouillé.",
      );
    }

    const configuredEmail =
      SYSTEM_ADMIN_BOOTSTRAP_EMAIL.value().trim().toLowerCase();

    if (
      !callerUser.email ||
      callerUser.email.trim().toLowerCase() !== configuredEmail
    ) {
      logger.warn(
        "Compte non autorisé pour le bootstrap.",
        {
          callerUid,
          email: callerUser.email ?? null,
        },
      );

      throw new HttpsError(
        "permission-denied",
        "Ce compte n'est pas autorisé à effectuer le bootstrap.",
      );
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
    await db.collection("users").doc(callerUid).set(
      {
        uid: callerUid,
        displayName:
          callerUser.displayName ||
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

        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        bootstrapCompletedAt: now,
      },
      {
        merge: true,
      },
    );

    /*
     * Journal de sécurité.
     */
    await db.collection("auditLogs").add({
      actorId: callerUid,
      actorRole: ADMIN_ROLE,
      action: "SYSTEM_ADMIN_BOOTSTRAP",
      resource: "system_admin",
      resourceId: callerUid,
      timestamp: FieldValue.serverTimestamp(),
      environment: "production",
      source: "cloud_function",
    });

    logger.info(
      "Administrateur Système initialisé.",
      {uid: callerUid},
    );

    return {
      success: true,
      message:
        "Administrateur Système initialisé avec succès.",
    };
  },
);

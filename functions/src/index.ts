import {initializeApp} from "firebase-admin/app";

import {setGlobalOptions} from "firebase-functions";

import {bootstrapSystemAdmin} from "./admin/bootstrapAdmin";

initializeApp();

setGlobalOptions({
  maxInstances: 10,
});

export {
  bootstrapSystemAdmin,
};

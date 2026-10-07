// Loader owns this actual module and the unchanged installed-entry setup chain.
import { createApprovedInstalledPlugin } from './installed-entry.mjs';
import { cloudAdmission } from './admission.mjs';
export default createApprovedInstalledPlugin({ cloudAdmission });

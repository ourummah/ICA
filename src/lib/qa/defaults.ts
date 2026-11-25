/**
 * Default pre-op checklist (SPEC F6). Plain-language items written for this app; sites edit them
 * on the admin "Pre-op checklist" screen. Relative-import safe: the seed script uses this file.
 */
export const DEFAULT_PREOP_ITEMS = [
  "No visible residue",
  "No foreign objects or tools left behind",
  "Equipment reassembled and guards on",
  "No pooled water",
  "No condensation over product zones",
  "Sanitiser drained",
  "ATP results within limits",
] as const;

// Vendor verification vocabulary. Keys must match server/src/services/
// vendorService.js (DOC_TYPES, CHANGE_ITEMS) and the VendorProfile schema.

export const DOC_TYPES = [
  { type: "cnic_front", label: "CNIC — front", hint: "Clear photo, all four corners visible", required: true },
  { type: "cnic_back", label: "CNIC — back", hint: "Clear photo, all four corners visible", required: true },
  { type: "business_proof", label: "Business proof", hint: "Optional — shop photo, registration, NTN, or a work sample", required: false },
  { type: "other", label: "Other documents", hint: "Optional — certificates, licences", required: false, multiple: true },
];

export const DOC_LABEL = Object.fromEntries(DOC_TYPES.map((doc) => [doc.type, doc.label]));
export const REQUIRED_DOC_TYPES = DOC_TYPES.filter((doc) => doc.required).map((doc) => doc.type);

export const CHANGE_ITEMS = {
  cnic_front: "CNIC front photo — missing or unclear",
  cnic_back: "CNIC back photo — missing or unclear",
  cnic_number: "CNIC number — missing or doesn't match the card",
  business_proof: "Business proof — missing or unclear",
  business_name: "Business name — incorrect or incomplete",
  description: "Description — too short or unclear",
  service_area: "City / service area — missing or incorrect",
  category: "Category — doesn't match your services",
};

export const VERIFICATION_STATUS = {
  pending: { label: "Awaiting review", tone: "bg-amber-100 text-amber-800" },
  changes_requested: { label: "Changes requested", tone: "bg-red-100 text-red-700" },
  approved: { label: "Verified", tone: "bg-primary/10 text-primary" },
};

/** Required documents the vendor hasn't uploaded, plus a missing CNIC number. */
export function missingItems(profile) {
  const present = new Set((profile.documents || []).map((doc) => doc.type));
  const missing = REQUIRED_DOC_TYPES.filter((type) => !present.has(type)).map((type) => DOC_LABEL[type]);
  if (!profile.cnicNumber) missing.push("CNIC number");
  return missing;
}

/** The admin's most recent change request, if the vendor still has one open. */
export function openChangeRequest(profile) {
  if (profile?.verificationStatus !== "changes_requested") return null;
  return [...(profile.reviewHistory || [])].reverse().find((entry) => entry.action === "changes_requested") || null;
}

export const isImageUrl = (url) => /\.(jpe?g|png|webp|gif)(\?|$)/i.test(url) || /\/image\/upload\//.test(url);

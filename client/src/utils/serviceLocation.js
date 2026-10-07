// Where a listing's work happens. Keys match Listing.serviceLocation on the server.
export const SERVICE_LOCATIONS = [
  { value: "customer", label: "At the customer's address", hint: "You travel to them — checkout asks for their address and phone." },
  { value: "vendor", label: "At my place", hint: "The customer comes to you; share directions in the booking chat." },
  { value: "online", label: "Online", hint: "Video call or remote — share the link in the booking chat." },
];

export const SERVICE_LOCATION_LABEL = {
  customer: "At your address",
  vendor: "At the provider's place",
  online: "Online",
};

const path = require("path");
// No override: a MONGODB_URI set in the shell wins over .env, so the seed
// can be pointed at a scratch database without touching the dev one.
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const User = require("./src/models/User");
const VendorProfile = require("./src/models/VendorProfile");
const Listing = require("./src/models/Listing");
const Booking = require("./src/models/Booking");
const Message = require("./src/models/Message");

const services = [
  { category: "Tutoring", businessName: "Bright Path Tutoring", name: "Sana Malik", email: "demo.tutor.math@example.com", title: "Math Tutoring Session", description: "A focused one-hour session for algebra, geometry, and exam preparation.", price: 12, durationMinutes: 60, photo: "https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=900&q=80" },
  { category: "Tutoring", businessName: "Northstar English Studio", name: "Hassan Raza", email: "demo.tutor.english@example.com", title: "English Conversation Practice", description: "Personal speaking practice for university, interviews, and everyday confidence.", price: 15, durationMinutes: 60, photo: "https://images.unsplash.com/photo-1524178232363-1fb2b075b655?auto=format&fit=crop&w=900&q=80" },
  { category: "Home Repair", businessName: "Reliable Fix Home Services", name: "Usman Tariq", email: "demo.repair.general@example.com", title: "Small Home Repairs", description: "Careful help with shelves, doors, fittings, leaking taps, and everyday household fixes.", price: 25, durationMinutes: 90, photo: "https://images.unsplash.com/photo-1581783898377-1c85bf937427?auto=format&fit=crop&w=900&q=80" },
  { category: "Home Repair", businessName: "CoolFlow Electric & Plumbing", name: "Bilal Ahmed", email: "demo.repair.electric@example.com", title: "Electrical Safety Check", description: "A practical inspection of sockets, switches, lights, and common household electrical issues.", price: 30, durationMinutes: 60, photo: "https://images.unsplash.com/photo-1621905252507-b35492cc74b4?auto=format&fit=crop&w=900&q=80" },
  { category: "Photography", businessName: "Golden Hour Portraits", name: "Areeba Khan", email: "demo.photo.portraits@example.com", title: "Outdoor Portrait Session", description: "A relaxed 45-minute portrait session with edited high-resolution images delivered online.", price: 80, durationMinutes: 60, photo: "https://images.unsplash.com/photo-1554048612-b6a482bc67e5?auto=format&fit=crop&w=900&q=80" },
  { category: "Photography", businessName: "Frame & Story Studio", name: "Hamza Noor", email: "demo.photo.events@example.com", title: "Small Event Photography", description: "Natural event coverage for birthdays, launches, and family gatherings up to two hours.", price: 140, durationMinutes: 120, photo: "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=900&q=80" },
  { category: "Events", businessName: "Gather Well Events", name: "Mariam Shah", email: "demo.events.planning@example.com", title: "Event Planning Consultation", description: "A practical planning session covering budget, schedule, suppliers, and guest experience.", price: 35, durationMinutes: 60, photo: "https://images.unsplash.com/photo-1507504031003-b417219a0fde?auto=format&fit=crop&w=900&q=80" },
  { category: "Events", businessName: "Petal & Table Styling", name: "Iqra Yousaf", email: "demo.events.styling@example.com", title: "Table and Decor Styling", description: "A tailored styling plan for intimate dinners, celebrations, and elegant home events.", price: 55, durationMinutes: 90, photo: "https://images.unsplash.com/photo-1478146896981-b80fe463b330?auto=format&fit=crop&w=900&q=80" },
  { category: "Cleaning", businessName: "ClearNest Cleaning Co.", name: "Nadia Aslam", email: "demo.cleaning.home@example.com", title: "Home Deep Clean", description: "A detailed clean for kitchens, bathrooms, living areas, and high-touch surfaces.", price: 45, durationMinutes: 120, photo: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=900&q=80" },
  { category: "Cleaning", businessName: "Fresh Start Move-Outs", name: "Farhan Iqbal", email: "demo.cleaning.moveout@example.com", title: "Move-Out Cleaning", description: "A thorough end-of-tenancy clean prepared for handover, inspection, or a fresh start.", price: 70, durationMinutes: 180, photo: "https://images.unsplash.com/photo-1527515637462-cff94eecc1ac?auto=format&fit=crop&w=900&q=80" },
];

async function findOrCreateUser(service) {
  return User.findOneAndUpdate(
    { email: service.email },
    { email: service.email, name: service.name, role: "vendor", passwordHash: await bcrypt.hash("Demo1234", 10), isVerified: true, status: "active" },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  // Demo admin — self-signup as admin is blocked in authService, so seed one here.
  await User.findOneAndUpdate(
    { email: "admin@example.com" },
    { email: "admin@example.com", name: "Demo Admin", role: "admin", passwordHash: await bcrypt.hash("Admin1234", 10), isVerified: true, status: "active" },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  // A customer with a known password always exists for testing, even on a
  // database where the demo booking hangs off an existing real account.
  const demoCustomer = await User.findOneAndUpdate(
    { email: "demo.customer@example.com" },
    { email: "demo.customer@example.com", name: "Demo Customer", role: "customer", passwordHash: await bcrypt.hash("Demo1234", 10), status: "active" },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  const customer = await User.findOne({ email: "omer@gmail.com" }) || demoCustomer;

  // An unverified vendor so the admin verification queue has something in it.
  const pendingVendor = await User.findOneAndUpdate(
    { email: "demo.vendor.pending@example.com" },
    { email: "demo.vendor.pending@example.com", name: "Kamran Ali", role: "vendor", passwordHash: await bcrypt.hash("Demo1234", 10), status: "active" },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  await VendorProfile.findOneAndUpdate(
    { userId: pendingVendor._id },
    { $setOnInsert: { userId: pendingVendor._id, businessName: "Sparkle Window Cleaning", category: "Cleaning", description: "Window and glass cleaning for homes and small offices.", isVerified: false, verificationStatus: "pending", reviewHistory: [{ action: "submitted", by: pendingVendor._id }], serviceArea: { city: "Lahore" } } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  // Deliberately incomplete — CNIC back and CNIC number missing — so an
  // admin can try "Request changes". Only filled in while still empty.
  await VendorProfile.updateOne(
    { userId: pendingVendor._id, "documents.0": { $exists: false } },
    { $set: { documents: [
      { type: "cnic_front", url: "https://placehold.co/600x380.png?text=CNIC+front+(sample)" },
      { type: "business_proof", url: "https://placehold.co/600x380.png?text=Shop+photo+(sample)" },
    ] } },
  );
  let tutoringListing;
  for (const service of services) {
    const vendorUser = await findOrCreateUser(service);
    const vendor = await VendorProfile.findOneAndUpdate(
      { userId: vendorUser._id },
      { userId: vendorUser._id, businessName: service.businessName, category: service.category, description: `Independent ${service.category.toLowerCase()} specialist serving local customers.`, isVerified: true, avgRating: 4.8, reviewCount: 12, serviceArea: { city: "Lahore" } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    await User.findByIdAndUpdate(vendorUser._id, { isVerified: true });
    const listing = await Listing.findOneAndUpdate(
      { vendorId: vendor._id, title: service.title },
      { vendorId: vendor._id, title: service.title, description: service.description, category: service.category, price: service.price, durationMinutes: service.durationMinutes, photos: [service.photo], isActive: true, availabilityRules: { daysOfWeek: [0, 1, 2, 3, 4, 5, 6], startTime: "09:00", endTime: "17:00" } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    if (service.category === "Tutoring" && !tutoringListing) tutoringListing = { listing, vendor };
  }

  const bookingDate = new Date();
  bookingDate.setUTCDate(bookingDate.getUTCDate() + 1);
  bookingDate.setUTCHours(0, 0, 0, 0);
  const booking = await Booking.findOneAndUpdate(
    { customerId: customer._id, listingId: tutoringListing.listing._id },
    // Insert-only: re-running the seed must never reset a booking that has
    // since moved on. It used to force status back to "pending" and wipe the
    // thread, leaving status contradicting statusHistory.
    { $setOnInsert: { listingId: tutoringListing.listing._id, customerId: customer._id, vendorId: tutoringListing.vendor._id, slot: { date: bookingDate, startTime: "10:00", endTime: "11:00" }, price: tutoringListing.listing.price, status: "pending", statusHistory: [{ status: "pending", changedAt: new Date(), changedBy: customer._id }] } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  if (!(await Message.exists({ bookingId: booking._id }))) {
    await Message.create([
      { bookingId: booking._id, senderId: customer._id, text: "Hello, I would like help with algebra." },
      { bookingId: booking._id, senderId: tutoringListing.vendor.userId, text: "Welcome! Please bring your current exercise sheet." },
    ]);
  }
  console.log(`Seeded ${services.length} realistic listings across ${new Set(services.map((service) => service.category)).size} categories.`);
  console.log(`Demo booking for ${customer.email}: ${booking._id}`);
  console.log("Test accounts (password Demo1234 unless noted):");
  console.log("  Admin            admin@example.com / Admin1234");
  console.log("  Customer         demo.customer@example.com");
  console.log("  Vendor           demo.tutor.math@example.com (verified, has listings)");
  console.log("  Vendor (pending) demo.vendor.pending@example.com (awaiting admin approval)");
  await mongoose.disconnect();
}

seed().catch(async (err) => {
  console.error(err.message);
  await mongoose.disconnect();
  process.exit(1);
});

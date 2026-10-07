import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { Payment, makeUser, makeVendor, makeListing, makeBooking, makePayment, requesterFor } from "./helpers/factories.js";

const require = createRequire(import.meta.url);
const payoutService = require("../src/services/payoutService.js");
const vendorService = require("../src/services/vendorService.js");
const Notification = require("../src/models/Notification.js");

async function vendorWithPayments(statuses) {
  const { user, profile } = await makeVendor();
  const listing = await makeListing(profile, { price: 1000 });
  const customer = await makeUser();
  const payments = [];
  for (const status of statuses) {
    const booking = await makeBooking({ listing, customer, vendorProfile: profile, status: "completed" });
    payments.push(await makePayment(booking, { status, commissionAmount: 100, releasedAt: status === "released" ? new Date() : null }));
  }
  return { user, profile, payments };
}

describe("vendor payout details", () => {
  it("validates and normalizes wallet numbers and IBANs, and keeps them private", async () => {
    const { user, profile } = await makeVendor();
    const owner = requesterFor(user);
    await expect(vendorService.updateProfile(profile._id, owner, { payoutMethod: { type: "jazzcash", accountTitle: "A", accountNumber: "12345" } })).rejects.toMatchObject({ statusCode: 400 });
    await expect(vendorService.updateProfile(profile._id, owner, { payoutMethod: { type: "bank", accountTitle: "A", bankName: "Meezan", accountNumber: "PK12" } })).rejects.toMatchObject({ statusCode: 400 });

    const wallet = await vendorService.updateProfile(profile._id, owner, { payoutMethod: { type: "easypaisa", accountTitle: "Ali Khan", accountNumber: "+92 300-1234567" } });
    expect(wallet.payoutMethod.accountNumber).toBe("03001234567");
    const bank = await vendorService.updateProfile(profile._id, owner, { payoutMethod: { type: "bank", accountTitle: "Ali Khan", bankName: "Standard Chartered", accountNumber: "pk36 scbl 0000 0011 2345 6702" } });
    expect(bank.payoutMethod.accountNumber).toBe("PK36SCBL0000001123456702");
    expect(await vendorService.getById(profile._id)).not.toHaveProperty("payoutMethod");
  });
});

describe("admin payouts", () => {
  it("lists only released, unpaid money per vendor with the net amount", async () => {
    const { profile } = await vendorWithPayments(["released", "released", "held", "refunded"]);
    const groups = await payoutService.getPendingPayouts();
    const mine = groups.find((g) => String(g.vendor._id) === String(profile._id));
    expect(mine.payments).toHaveLength(2);
    expect(mine.total).toBe(1800); // 2 × (1000 − 100)
  });

  it("mark-paid records the reference, notifies the vendor, and empties the queue", async () => {
    const { user, profile, payments } = await vendorWithPayments(["released", "released"]);
    const admin = requesterFor(await makeUser({ role: "admin" }));
    const ids = payments.map((p) => String(p._id));

    await expect(payoutService.markPaid(admin, { vendorId: profile._id, paymentIds: ids, reference: "" })).rejects.toMatchObject({ statusCode: 400 });
    const result = await payoutService.markPaid(admin, { vendorId: String(profile._id), paymentIds: ids, reference: "IBFT-123" });
    expect(result.total).toBe(1800);

    const after = await Payment.findById(ids[0]);
    expect(after.payout.status).toBe("paid");
    expect(after.payout.reference).toBe("IBFT-123");
    expect((await payoutService.getPendingPayouts()).find((g) => String(g.vendor._id) === String(profile._id))).toBeUndefined();
    expect(await Notification.countDocuments({ userId: user._id, type: "payout_sent" })).toBe(1);
    expect((await payoutService.getPayoutHistory()).map((h) => String(h._id))).toEqual(expect.arrayContaining(ids));

    // Paying the same money twice is refused.
    await expect(payoutService.markPaid(admin, { vendorId: String(profile._id), paymentIds: ids, reference: "AGAIN" })).rejects.toMatchObject({ statusCode: 409 });
  });

  it("refuses held money and another vendor's payments", async () => {
    const a = await vendorWithPayments(["released", "held"]);
    const b = await vendorWithPayments(["released"]);
    const admin = requesterFor(await makeUser({ role: "admin" }));
    await expect(payoutService.markPaid(admin, { vendorId: String(a.profile._id), paymentIds: [String(a.payments[1]._id)], reference: "X" })).rejects.toMatchObject({ statusCode: 400 });
    await expect(payoutService.markPaid(admin, { vendorId: String(a.profile._id), paymentIds: [String(a.payments[0]._id), String(b.payments[0]._id)], reference: "X" })).rejects.toMatchObject({ statusCode: 400 });
    expect((await Payment.findById(a.payments[0]._id)).payout.status).toBe("unpaid");
  });
});

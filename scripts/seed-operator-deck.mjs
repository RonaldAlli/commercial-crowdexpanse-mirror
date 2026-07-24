// Operator Test Deck — seeds a realistic acquisition day's queue so the operator workflow can be judged
// under real conditions (not "does it work?" but "does it flow for 8 hours?"). NOT random data: hand-built
// scenarios across new leads, callbacks, voicemails, hot leads, wrong numbers, DNC, and appointments, each
// with a believable communication history that populates the unified Timeline.
//
// Idempotent + safe to re-run: every deck seller is tagged acquisitionCampaign = DECK_TAG, so re-seeding
// deletes the prior deck (and its children) first. Teardown = delete where acquisitionCampaign = DECK_TAG.
//
// Usage:  node scripts/seed-operator-deck.mjs           (seed/reseed)
//         node scripts/seed-operator-deck.mjs --clear   (remove the deck only)

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DECK_TAG = "OPERATOR_TEST_DECK";
const OPERATOR_EMAIL = "operator@commercial.crowdexpanse.com";

const now = new Date();
const min = (n) => new Date(now.getTime() - n * 60_000);
const days = (n, hour = 10) => {
  const d = new Date(now);
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return d;
};

// ---- The deck. Each entry: seller fields + one property + a history (backdated so it never counts as
// "today"). followMin = minutes-ago for nextFollowUpAt (=> due now, ordered most-overdue-first in the queue).
const NEW_LEADS = [
  ["Gregory Paulson", null, "OWNER_DIRECT", "Retiring landlord, tired of tenant calls", "MULTIFAMILY", "Birchwood Fourplex", { unitCount: 4, askingPriceUsd: 620000 }, "Akron", "OH"],
  ["Marisol Ibarra", "Ibarra Family Holdings LLC", "COUNTY_RECORDS", "Absentee owner, lives out of state", "RETAIL", "Cactus Strip Center", { squareFeet: 8200, askingPriceUsd: 1150000 }, "Mesa", "AZ"],
  ["Terrence Walcott", null, "DIRECT_MAIL", "Inherited from father's estate, wants a clean sale", "LAND", "Route 9 Frontage Parcel", { acreage: 6.4, askingPriceUsd: 340000 }, "Ocala", "FL"],
  ["Priya Nandakumar", "Summit Logistics LLC", "COMMERCIAL_BROKER", "Portfolio rebalance, motivated on price", "INDUSTRIAL", "Warehouse 14", { squareFeet: 24000, askingPriceUsd: 2100000 }, "Grand Rapids", "MI"],
  ["Devon Clarke", null, "TAX_DELINQUENT", "Behind on taxes, needs to move quickly", "MIXED_USE", "Corner of 5th & Main", { squareFeet: 5600, askingPriceUsd: 780000 }, "Chattanooga", "TN"],
  ["Angela Ruiz", null, "WEB_INBOUND", "Divorce, wants a fast quiet sale", "MULTIFAMILY", "Palm Court Duplex", { unitCount: 2, askingPriceUsd: 415000 }, "Fresno", "CA"],
  ["Howard Feld", "Feld Storage Partners LLC", "OWNER_DIRECT", "Health issues, ready to exit", "SELF_STORAGE", "Eastgate Self Storage", { unitCount: 120, askingPriceUsd: 3400000 }, "Wichita", "KS"],
  ["Nia Bledsoe", null, "REFERRAL", "Relocating for work, must sell", "OFFICE", "Meridian Office Suites", { squareFeet: 11200, askingPriceUsd: 1650000 }, "Raleigh", "NC"],
  ["Franklin Osei", "Osei Holdings LLC", "CREXI", "Underperforming asset, wants out", "RETAIL", "Southside Plaza", { squareFeet: 14500, askingPriceUsd: 1980000 }, "Columbus", "GA"],
  ["Sandra Whitmore", null, "COUNTY_RECORDS", "Inherited property, absentee, no interest in managing", "MOBILE_HOME_PARK", "Whispering Pines MHP", { unitCount: 38, askingPriceUsd: 2750000 }, "Lakeland", "FL"],
];

const CALLBACKS = [
  ["Raymond Tisdale", null, "OUTBOUND_CALLING", "Curious about price, wants to talk numbers", "MULTIFAMILY", "Lincoln Ave 6-plex", { unitCount: 6, askingPriceUsd: 890000 }, "Dayton", "OH", 280],
  ["Beatrice Kowalski", "Kowalski Retail LLC", "COMMERCIAL_BROKER", "Comparing offers, call back this afternoon", "RETAIL", "Maple Row Shops", { squareFeet: 9800, askingPriceUsd: 1320000 }, "Toledo", "OH", 240],
  ["Malik Johnson", null, "REFERRAL", "Interested but needs spouse's buy-in", "OFFICE", "Gateway Professional Bldg", { squareFeet: 7400, askingPriceUsd: 990000 }, "Memphis", "TN", 190],
  ["Elena Vasquez", null, "WEB_INBOUND", "Wants a written offer before deciding", "MIXED_USE", "Riverside Live-Work", { squareFeet: 4300, askingPriceUsd: 720000 }, "Albuquerque", "NM", 150],
  ["Chad Bergstrom", "Bergstrom Industrial LLC", "CREXI", "Open to selling at the right number", "INDUSTRIAL", "Depot Yard 3", { squareFeet: 31000, askingPriceUsd: 2600000 }, "Rockford", "IL", 120],
  ["Tamara Hollis", null, "DIRECT_MAIL", "Motivated, asked to reconnect today", "LAND", "Hollis Ranch Acreage", { acreage: 22, askingPriceUsd: 610000 }, "Amarillo", "TX", 80],
  ["Victor Nguyen", "Nguyen Family LP", "OWNER_DIRECT", "Weighing 1031 exchange options", "SELF_STORAGE", "Harbor Mini Storage", { unitCount: 90, askingPriceUsd: 2900000 }, "Stockton", "CA", 45],
  ["Deborah Frost", null, "OUTBOUND_CALLING", "Warming up, wants more detail on process", "MULTIFAMILY", "Frost Garden Apartments", { unitCount: 12, askingPriceUsd: 1450000 }, "Des Moines", "IA", 20],
];

const VOICEMAILS = [
  ["Leonard Pike", null, "OUTBOUND_CALLING", "Left VM about his vacant retail unit", "RETAIL", "Pike Corner Store", { squareFeet: 3200, askingPriceUsd: 480000 }, "Spokane", "WA", 200],
  ["Yolanda Reyes", "Reyes Holdings LLC", "COUNTY_RECORDS", "VM left re: tax-delinquent parcel", "LAND", "Reyes Infill Lot", { acreage: 1.1, askingPriceUsd: 155000 }, "El Paso", "TX", 160],
  ["Curtis Mabry", null, "DIRECT_MAIL", "VM left, absentee owner", "MULTIFAMILY", "Mabry Triplex", { unitCount: 3, askingPriceUsd: 395000 }, "Shreveport", "LA", 110],
  ["Irene Sokolov", null, "REFERRAL", "VM left, inherited estate property", "OFFICE", "Sokolov Suite 200", { squareFeet: 5100, askingPriceUsd: 730000 }, "Boise", "ID", 70],
  ["Marcus Delgado", "Delgado Partners LLC", "CREXI", "VM left re: underperforming strip", "RETAIL", "Delgado Plaza", { squareFeet: 12200, askingPriceUsd: 1580000 }, "Bakersfield", "CA", 30],
];

const HOT = [
  ["Vivian Chao", "Chao Capital LLC", "COMMERCIAL_BROKER", "Ready to sell, wants to close in 45 days", "MULTIFAMILY", "Chao Court Apartments", { unitCount: 18, askingPriceUsd: 2250000, estimatedValueUsd: 2400000 }, "San Jose", "CA", 175],
  ["Roland Beckett", null, "REFERRAL", "Retiring, verbally agreed on price range", "INDUSTRIAL", "Beckett Manufacturing", { squareFeet: 42000, askingPriceUsd: 3800000, estimatedValueUsd: 4000000 }, "Youngstown", "OH", 130],
  ["Sofia Marchetti", "Marchetti Estate LLC", "OWNER_DIRECT", "Estate sale, executor wants it done", "MIXED_USE", "Marchetti Block", { squareFeet: 16800, askingPriceUsd: 2950000, estimatedValueUsd: 3100000 }, "Providence", "RI", 90],
  ["Aaron Whitfield", null, "OUTBOUND_CALLING", "Qualified, financing pre-cleared", "RETAIL", "Whitfield Town Center", { squareFeet: 21000, askingPriceUsd: 3200000, estimatedValueUsd: 3350000 }, "Greenville", "SC", 55],
  ["Lucia Ferreira", "Ferreira Holdings LLC", "CREXI", "Hot — wants offer memo this week", "SELF_STORAGE", "Ferreira Storage Depot", { unitCount: 210, askingPriceUsd: 5400000, estimatedValueUsd: 5600000 }, "Orlando", "FL", 15],
];

const WRONG = [
  ["Norman Pratt", null, "DIRECT_MAIL", "Number on file is disconnected", "LAND", "Pratt Rural Parcel", { acreage: 40, askingPriceUsd: 520000 }, "Pueblo", "CO", 100],
  ["Gloria Sandoval", "Sandoval LLC", "COUNTY_RECORDS", "Reached a stranger, not the owner", "RETAIL", "Sandoval Market", { squareFeet: 6100, askingPriceUsd: 690000 }, "Modesto", "CA", 60],
  ["Earl Dietrich", null, "OUTBOUND_CALLING", "Wrong number, need skip trace", "OFFICE", "Dietrich Office Park", { squareFeet: 9200, askingPriceUsd: 1240000 }, "Erie", "PA", 25],
];

const DNC = [
  ["Harriet Cole", null, "OUTBOUND_CALLING", "Asked to be removed from all lists", "MULTIFAMILY", "Cole Duplex", { unitCount: 2, askingPriceUsd: 360000 }, "Lansing", "MI"],
  ["Byron Tate", "Tate Group LLC", "DIRECT_MAIL", "Hostile, do not contact again", "INDUSTRIAL", "Tate Warehouse", { squareFeet: 18000, askingPriceUsd: 1900000 }, "Gary", "IN"],
  ["Della Monroe", null, "COUNTY_RECORDS", "Attorney said no contact", "LAND", "Monroe Estate Lot", { acreage: 3.2, askingPriceUsd: 210000 }, "Macon", "GA"],
];

const APPOINTMENTS = [
  ["Preston Vaughn", "Vaughn Retail LLC", "COMMERCIAL_BROKER", "Site visit set for Thursday 10am", "RETAIL", "Vaughn Shopping Plaza", { squareFeet: 19500, askingPriceUsd: 2850000 }, "Knoxville", "TN", 210],
  ["Camille Rousseau", null, "REFERRAL", "Meeting booked to review offer", "MULTIFAMILY", "Rousseau Flats", { unitCount: 8, askingPriceUsd: 1180000 }, "Baton Rouge", "LA", 140],
  ["Sterling Okafor", "Okafor Holdings LLC", "OWNER_DIRECT", "Appointment set at property tomorrow", "OFFICE", "Okafor Executive Center", { squareFeet: 13400, askingPriceUsd: 1740000 }, "Durham", "NC", 65],
];

async function resetDeck(orgId) {
  const sellers = await prisma.seller.findMany({ where: { organizationId: orgId, acquisitionCampaign: DECK_TAG }, select: { id: true } });
  const ids = sellers.map((s) => s.id);
  if (ids.length === 0) return 0;
  await prisma.commsMessage.deleteMany({ where: { sellerId: { in: ids } } });
  await prisma.callRecord.deleteMany({ where: { sellerId: { in: ids } } });
  await prisma.conversation.deleteMany({ where: { sellerId: { in: ids } } });
  await prisma.contactTouch.deleteMany({ where: { sellerId: { in: ids } } });
  await prisma.activityLog.deleteMany({ where: { sellerId: { in: ids } } });
  await prisma.property.deleteMany({ where: { sellerId: { in: ids } } });
  await prisma.seller.deleteMany({ where: { id: { in: ids } } });
  return ids.length;
}

function digits(i) {
  const n = (4045550000 + i * 37).toString();
  return `+1${n.slice(0, 10)}`;
}

async function createSeller(orgId, userId, spec, idx) {
  const [name, company, channel, motivation, assetType, propName, propMetrics, city, state] = spec.base;
  const seller = await prisma.seller.create({
    data: {
      organizationId: orgId,
      name,
      company,
      email: `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@example.com`,
      phone: spec.badPhone ? digits(idx) : digits(idx),
      motivation,
      city,
      state,
      acquisitionChannel: channel,
      acquisitionCampaign: DECK_TAG,
      outreachStatus: spec.status,
      nextFollowUpAt: spec.followMin != null ? min(spec.followMin) : null,
      badPhone: Boolean(spec.badPhone),
      doNotCall: Boolean(spec.doNotCall),
      createdAt: days(14 + (idx % 10)),
    },
  });

  await prisma.property.create({
    data: {
      organizationId: orgId,
      sellerId: seller.id,
      name: propName,
      assetType,
      addressLine1: `${100 + idx} ${propName.split(" ")[0]} Way`,
      city,
      state,
      postalCode: String(30000 + idx),
      ...propMetrics,
      createdAt: days(14),
    },
  });

  // History (backdated). Create a Conversation only if there are messages/calls to attach.
  const needsConversation = spec.history.some((h) => h.t === "sms" || h.t === "email" || h.t === "call");
  let conversationId = null;
  if (needsConversation) {
    const conv = await prisma.conversation.create({
      data: { organizationId: orgId, sellerId: seller.id, lastActivityAt: now, createdAt: days(10) },
    });
    conversationId = conv.id;
  }

  for (const h of spec.history) {
    if (h.t === "note" || h.t === "callTouch") {
      await prisma.contactTouch.create({
        data: { organizationId: orgId, sellerId: seller.id, type: h.type ?? "NOTE", summary: h.summary, createdById: userId, createdAt: h.at },
      });
    } else if (h.t === "call") {
      await prisma.callRecord.create({
        data: { organizationId: orgId, conversationId, sellerId: seller.id, direction: "OUTBOUND", status: h.status ?? "COMPLETED", disposition: h.disposition ?? null, durationSec: h.durationSec ?? null, fromNumber: "+14045550100", toNumber: seller.phone, startedAt: h.at, endedAt: h.at, createdAt: h.at },
      });
      if (h.summary) {
        await prisma.contactTouch.create({
          data: { organizationId: orgId, sellerId: seller.id, type: "CALL", summary: h.summary, createdById: userId, createdAt: h.at },
        });
      }
    } else if (h.t === "sms" || h.t === "email") {
      await prisma.commsMessage.create({
        data: {
          organizationId: orgId, conversationId, sellerId: seller.id,
          channel: h.t === "sms" ? "SMS" : "EMAIL", direction: h.dir,
          status: h.dir === "INBOUND" ? "RECEIVED" : "DELIVERED",
          body: h.body, subject: h.t === "email" ? h.subject ?? null : null,
          sentAt: h.dir === "OUTBOUND" ? h.at : null, deliveredAt: h.dir === "OUTBOUND" ? h.at : null, createdAt: h.at,
        },
      });
    } else if (h.t === "status") {
      await prisma.activityLog.create({
        data: { organizationId: orgId, sellerId: seller.id, actorId: userId, eventType: "seller.outreach_status_changed", eventLabel: h.label, createdAt: h.at },
      });
    }
  }
  return seller;
}

// Build the per-bucket history + status/flags for each row.
function specsFor() {
  const specs = [];
  NEW_LEADS.forEach((base) => specs.push({ base, status: "NEW", followMin: 300 - specs.length * 3, history: [] }));
  CALLBACKS.forEach((row) => {
    const base = row.slice(0, 9), followMin = row[9];
    specs.push({ base, status: "CONTACTED", followMin, history: [
      { t: "call", at: days(2, 14), summary: "Call — connected", disposition: "Connected", status: "COMPLETED", durationSec: 210 },
      { t: "note", type: "NOTE", at: days(2, 14), summary: "Interested. Asked to call back today to discuss numbers." },
      { t: "status", at: days(2, 14), label: "Outreach status: New → Contacted" },
    ] });
  });
  VOICEMAILS.forEach((row) => {
    const base = row.slice(0, 9), followMin = row[9];
    specs.push({ base, status: "ATTEMPTING", followMin, history: [
      { t: "call", at: days(1, 11), summary: "Call — left voicemail", disposition: "Voicemail", status: "NO_ANSWER" },
      { t: "status", at: days(1, 11), label: "Outreach status: New → Attempting" },
    ] });
  });
  HOT.forEach((row) => {
    const base = row.slice(0, 9), followMin = row[9];
    specs.push({ base, status: "QUALIFIED", followMin, history: [
      { t: "call", at: days(6, 10), summary: "Call — connected", disposition: "Connected", status: "COMPLETED", durationSec: 320 },
      { t: "status", at: days(6, 10), label: "Outreach status: New → Responded" },
      { t: "sms", at: days(5, 9), dir: "OUTBOUND", body: "Great talking today — sending over a few questions about the property." },
      { t: "sms", at: days(5, 9), dir: "INBOUND", body: "Sounds good, ask away. Motivated to move on this." },
      { t: "email", at: days(4, 15), dir: "OUTBOUND", subject: "Following up on your property", body: "Thanks for the details. Numbers look workable on our end — want to line up next steps." },
      { t: "call", at: days(2, 13), summary: "Call — connected", disposition: "Connected", status: "COMPLETED", durationSec: 260 },
      { t: "note", type: "NOTE", at: days(2, 13), summary: "Confirmed asking range and timeline. Qualified — ready for an offer memo." },
      { t: "status", at: days(2, 13), label: "Outreach status: Responded → Qualified" },
    ] });
  });
  WRONG.forEach((row) => {
    const base = row.slice(0, 9), followMin = row[9];
    specs.push({ base, status: "ATTEMPTING", followMin, badPhone: true, history: [
      { t: "call", at: days(1, 12), summary: "Call — wrong number", disposition: "Wrong number", status: "COMPLETED" },
    ] });
  });
  DNC.forEach((base) => {
    specs.push({ base, status: "DO_NOT_CONTACT", followMin: null, doNotCall: true, history: [
      { t: "call", at: days(3, 12), summary: "Call — do not contact", disposition: "DNC", status: "COMPLETED" },
      { t: "status", at: days(3, 12), label: "Outreach status: Contacted → Do not contact" },
    ] });
  });
  APPOINTMENTS.forEach((row) => {
    const base = row.slice(0, 9), followMin = row[9];
    specs.push({ base, status: "RESPONDED", followMin, history: [
      { t: "call", at: days(1, 10), summary: "Call — appointment set", disposition: "Appointment set", status: "COMPLETED", durationSec: 240 },
      { t: "note", type: "NOTE", at: days(1, 10), summary: "Appointment booked. Bring comps and a draft LOI." },
      { t: "status", at: days(1, 10), label: "Outreach status: Contacted → Responded" },
    ] });
  });
  return specs;
}

async function main() {
  const clearOnly = process.argv.includes("--clear");
  const user =
    (await prisma.user.findUnique({ where: { email: OPERATOR_EMAIL }, select: { id: true, organizationId: true } })) ??
    (await prisma.user.findFirst({ where: { role: "ADMIN" }, select: { id: true, organizationId: true }, orderBy: { createdAt: "asc" } }));
  if (!user) throw new Error(`no operator/admin user found to own the deck`);
  const orgId = user.organizationId;

  const removed = await resetDeck(orgId);
  console.log(`[deck] cleared ${removed} prior deck sellers`);
  if (clearOnly) { console.log("[deck] --clear done"); return; }

  const specs = specsFor();
  let i = 0;
  for (const spec of specs) {
    await createSeller(orgId, user.id, spec, i);
    i += 1;
  }
  console.log(`[deck] seeded ${specs.length} sellers across buckets: new=${NEW_LEADS.length} callbacks=${CALLBACKS.length} voicemail=${VOICEMAILS.length} hot=${HOT.length} wrong=${WRONG.length} dnc=${DNC.length} appt=${APPOINTMENTS.length}`);
  const inQueue = specs.filter((s) => s.status !== "DO_NOT_CONTACT" && s.status !== "DEAD").length;
  console.log(`[deck] ${inQueue} will appear in the work queue (DNC excluded by design)`);
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });

import { test } from "node:test";
import assert from "node:assert/strict";
import { ContactMethod, ContactOutreachStatus, ContactTouchType } from "@prisma/client";

import {
  outreachStatusLabel,
  outreachStatusTone,
  contactMethodLabel,
  touchTypeLabel,
} from "../../../lib/contact-options";

// Tests the EXISTING intended behavior of the pure CRM option helpers (no invented rules).
// The switches have no default case, so the guarantee under test is: every enum value maps to a
// defined label/tone (exhaustiveness) — a regression here would surface a new/renamed enum value.

test("outreachStatusLabel: every ContactOutreachStatus maps to a non-empty label", () => {
  const expected = {
    NEW: "New", ATTEMPTING: "Attempting", CONTACTED: "Contacted", RESPONDED: "Responded",
    QUALIFIED: "Qualified", DEAD: "Dead", DO_NOT_CONTACT: "Do not contact",
  };
  for (const s of Object.values(ContactOutreachStatus)) {
    const label = outreachStatusLabel(s);
    assert.equal(typeof label, "string");
    assert.ok(label.length > 0, `${s} has a label`);
    assert.equal(label, expected[s], `${s} label`);
  }
});

test("outreachStatusTone: every status maps to a defined tone", () => {
  const tones = new Set(["neutral", "warning", "info", "success", "danger"]);
  for (const s of Object.values(ContactOutreachStatus)) {
    assert.ok(tones.has(outreachStatusTone(s)), `${s} tone is valid`);
  }
  // Spot-check the accepted mapping (DEAD/DO_NOT_CONTACT are danger; RESPONDED/QUALIFIED success).
  assert.equal(outreachStatusTone(ContactOutreachStatus.DEAD), "danger");
  assert.equal(outreachStatusTone(ContactOutreachStatus.DO_NOT_CONTACT), "danger");
  assert.equal(outreachStatusTone(ContactOutreachStatus.QUALIFIED), "success");
  assert.equal(outreachStatusTone(ContactOutreachStatus.NEW), "neutral");
});

test("contactMethodLabel: null → 'Not set'; every method → a label", () => {
  assert.equal(contactMethodLabel(null), "Not set");
  const expected = { CALL: "Call", TEXT: "Text", EMAIL: "Email", MAIL: "Mail" };
  for (const m of Object.values(ContactMethod)) {
    assert.equal(contactMethodLabel(m), expected[m], `${m} label`);
  }
});

test("touchTypeLabel: every ContactTouchType maps to a label", () => {
  const expected = { CALL: "Call", TEXT: "Text", EMAIL: "Email", MAIL: "Mail", NOTE: "Note" };
  for (const t of Object.values(ContactTouchType)) {
    assert.equal(touchTypeLabel(t), expected[t], `${t} label`);
  }
});

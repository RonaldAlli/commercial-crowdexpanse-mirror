import { test } from "node:test";
import assert from "node:assert/strict";

import { sellerQualificationChecklist, checklistProgress } from "../../../lib/acquisition-checklist";

const complete = {
  phone: "404-555-0100",
  email: "a@b.com",
  motivation: "Retiring",
  hasProperty: true,
  hasAcquisitionChannel: true,
  outreachStatus: "QUALIFIED" as const,
};

test("a fully-worked seller has every checklist item done (5/5)", () => {
  const items = sellerQualificationChecklist(complete);
  assert.ok(items.every((i) => i.done));
  assert.deepEqual(checklistProgress(items), { done: 5, total: 5 });
});

test("missing reachability, source, motivation, property drop their items", () => {
  const items = sellerQualificationChecklist({
    phone: null,
    email: null,
    motivation: null,
    hasProperty: false,
    hasAcquisitionChannel: false,
    outreachStatus: "NEW",
  });
  assert.deepEqual(checklistProgress(items), { done: 0, total: 5 });
});

test("phone OR email counts as reachable", () => {
  const items = sellerQualificationChecklist({ ...complete, phone: null, email: "x@y.com" });
  assert.ok(items.find((i) => i.label.startsWith("Reachable"))?.done);
});

test("contact-made item is true only for RESPONDED or QUALIFIED", () => {
  for (const status of ["NEW", "ATTEMPTING", "CONTACTED"] as const) {
    const items = sellerQualificationChecklist({ ...complete, outreachStatus: status });
    assert.equal(items.find((i) => i.label.startsWith("Contact made"))?.done, false, status);
  }
  for (const status of ["RESPONDED", "QUALIFIED"] as const) {
    const items = sellerQualificationChecklist({ ...complete, outreachStatus: status });
    assert.equal(items.find((i) => i.label.startsWith("Contact made"))?.done, true, status);
  }
});

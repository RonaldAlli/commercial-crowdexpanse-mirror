import { test } from "node:test";
import assert from "node:assert/strict";

import {
  isAcquisitionChannel,
  channelLabel,
  opportunityAttributionFromSeller,
  CHANNEL_GROUPS,
} from "../../../lib/acquisition-options";

test("isAcquisitionChannel accepts governed values, rejects everything else", () => {
  assert.ok(isAcquisitionChannel("OWNER_DIRECT"));
  assert.ok(isAcquisitionChannel("DEALFLOW_PROBATE"));
  assert.ok(!isAcquisitionChannel("")); // empty → not a channel (drives the "required" error)
  assert.ok(!isAcquisitionChannel("NONSENSE"));
  assert.ok(!isAcquisitionChannel("owner_direct")); // enum is case-sensitive
});

test("channelLabel maps to a human label", () => {
  assert.equal(channelLabel("CREXI"), "Crexi");
  assert.equal(channelLabel("DEALFLOW_FSBO"), "DealFlow — FSBO");
});

test("taxonomy = 22 governed channels across two groups (commercial + DealFlow)", () => {
  const total = CHANNEL_GROUPS.reduce((n, g) => n + g.options.length, 0);
  assert.equal(total, 22);
  assert.equal(CHANNEL_GROUPS.length, 2);
});

test("AC-ATTR-2 · opportunityAttributionFromSeller copies all three layers by value", () => {
  const seller = {
    acquisitionChannel: "OWNER_DIRECT",
    acquisitionCampaign: "Q3 owner push",
    acquisitionEventKey: "job_123",
  } as const;
  assert.deepEqual(opportunityAttributionFromSeller(seller), {
    acquisitionChannel: "OWNER_DIRECT",
    acquisitionCampaign: "Q3 owner push",
    acquisitionEventKey: "job_123",
  });
});

test("no lead → all-null attribution (UNKNOWN), never throws", () => {
  assert.deepEqual(opportunityAttributionFromSeller(null), {
    acquisitionChannel: null,
    acquisitionCampaign: null,
    acquisitionEventKey: null,
  });
});

test("partial lead attribution is null-filled per field (channel without campaign/event)", () => {
  assert.deepEqual(opportunityAttributionFromSeller({ acquisitionChannel: "CREXI" }), {
    acquisitionChannel: "CREXI",
    acquisitionCampaign: null,
    acquisitionEventKey: null,
  });
});

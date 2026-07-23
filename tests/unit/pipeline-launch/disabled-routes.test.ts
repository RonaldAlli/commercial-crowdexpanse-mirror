import { test } from "node:test";
import assert from "node:assert/strict";

import { POST } from "../../../app/(workspace)/../api/pipeline/[opportunityId]/fact-operations/route";
import { GET } from "../../../app/(workspace)/../api/pipeline/[opportunityId]/route";

// The dormant pipeline HTTP surface is CLOSED for launch — the write route no longer accepts a
// client-supplied actor (it returns 404 before any coordinator work), and the read route is gated too.

test("pipeline fact-operations WRITE route is disabled → 404 (no actor-spoofing surface)", async () => {
  const res = await POST();
  assert.equal(res.status, 404);
});

test("pipeline READ route is disabled → 404", async () => {
  const res = await GET();
  assert.equal(res.status, 404);
});

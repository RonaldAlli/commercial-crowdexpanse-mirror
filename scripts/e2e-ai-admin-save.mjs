// Regression test for the AI Provider save path (integration; needs a running
// instance). Guards the fix for the "Re-enter your password" bug: saving/replacing/
// revoking the provider key requires ONLY admin authorization + the encryption key —
// NO password re-entry (matching the sibling saveCommsSettings pattern).
//
// Usage: BASE_URL=http://127.0.0.1:3055 ADMIN_ID=<id> node --env-file=.env --import tsx \
//        scripts/e2e-ai-admin-save.mjs      (requires @playwright/test + SESSION_SECRET)
import { chromium } from "@playwright/test";
import crypto from "node:crypto";

const BASE = process.env.BASE_URL || "http://127.0.0.1:3055";
const ADMIN_ID = process.env.ADMIN_ID;
const secret = process.env.SESSION_SECRET;
if (!ADMIN_ID || !secret) { console.error("set ADMIN_ID and SESSION_SECRET"); process.exit(2); }

const ts = Date.now().toString();
const p = `${ADMIN_ID}.${ts}`;
const cookieVal = `${p}.${crypto.createHmac("sha256", secret).update(p).digest("hex")}`;
const R = []; const rec = (n, ok) => { R.push({ n, ok }); console.log(`  ${ok ? "PASS" : "FAIL"} ${n}`); };

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
await ctx.addCookies([{ name: "ce_commercial_session", value: cookieVal, url: BASE }]);
const page = await ctx.newPage();
const text = () => page.locator("body").innerText();
async function submit(sel) { await Promise.all([page.waitForNavigation({ waitUntil: "networkidle" }).catch(() => {}), page.click(sel)]); await page.waitForLoadState("networkidle").catch(() => {}); }

try {
  await page.goto(`${BASE}/settings/ai`, { waitUntil: "networkidle" });
  rec("no confirm-password field on the page", (await page.locator('input[name="confirmPassword"]').count()) === 0);

  // Save config + a new key with NO password → must succeed (last4 shown), NOT the reauth error.
  await page.fill('input[name="model"]', "claude-sonnet-5");
  await page.fill('input[name="approvedModels"]', "claude-sonnet-5");
  await page.fill('input[name="apiKey"]', "sk-ant-FAKE-regression-9999");
  await submit('button:has-text("Save AI settings")');
  const s = await text();
  rec("save with key succeeds WITHOUT any password", /••••9999/.test(s));
  rec("no 'Re-enter your password' error", !/re-enter your password/i.test(s));

  // Revoke with NO password → must succeed.
  await submit('button:has-text("Revoke key")');
  rec("revoke succeeds WITHOUT any password", /revoked|Stored API key\s*none/i.test(await text()));
} catch (e) {
  rec("regression run without exception", false);
  console.error(e.message);
} finally {
  console.log(`\n${R.every((r) => r.ok) ? "PASS" : "FAIL"} — ${R.filter((r) => r.ok).length}/${R.length}`);
  await browser.close();
  if (!R.every((r) => r.ok)) process.exit(1);
}

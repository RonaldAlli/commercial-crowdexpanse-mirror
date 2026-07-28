import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import assert from "node:assert/strict";

import detectorConfig from "../../../config/be3-language-detector.json";
import { runBe3Detector, stableStringifyReport } from "../../../lib/governance/be3-language-detector";

const ROOT = process.cwd();
const GLOSSARY = readFileSync(join(ROOT, "docs/business/evolution/be-3/CANONICAL_GLOSSARY.md"), "utf8");
const RULES = readFileSync(join(ROOT, "docs/business/evolution/be-3/LANGUAGE_RULES.md"), "utf8");

function makeRepo(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "be3-detector-"));
  mkdirSync(join(root, "docs/business/evolution/be-3"), { recursive: true });
  writeFileSync(join(root, "docs/business/evolution/be-3/CANONICAL_GLOSSARY.md"), GLOSSARY, "utf8");
  writeFileSync(join(root, "docs/business/evolution/be-3/LANGUAGE_RULES.md"), RULES, "utf8");
  for (const [relativePath, content] of Object.entries(files)) {
    const full = join(root, relativePath);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content, "utf8");
  }
  return root;
}

function findingsByRule(rootDir: string) {
  return runBe3Detector({ rootDir, config: detectorConfig as any }).findings.reduce<Record<string, string[]>>((acc, finding) => {
    const bucket = acc[finding.ruleId] ?? [];
    bucket.push(`${finding.file}:${finding.line}:${finding.matched}`);
    acc[finding.ruleId] = bucket;
    return acc;
  }, {});
}

test("detector flags each BE-3 rule and skips approved exceptions", () => {
  const root = makeRepo({
    "app/(workspace)/dashboard/page.tsx": [
      "export default function Page() {",
      "  return <section><p>Pipeline</p><p>Pipeline handoff</p><p>lead</p></section>;",
      "}",
    ].join("\n"),
    "app/(workspace)/acquire/page.tsx": [
      "export const copy = 'current target';",
      "export const keep = 'targetAssetTypes';",
      "export const queue = 'lead queue';",
      "export const importPath = 'dealautomator.com/commercial-lead';",
    ].join("\n"),
    "app/(workspace)/opportunities/actions.ts": [
      "export const shape = { source: value, acquisitionChannel: value };",
      "export const label = 'Source';",
      "export const good = 'Acquisition source';",
    ].join("\n"),
    "app/(workspace)/owners/candidates/page.tsx": [
      "export const kind = 'OwnerMatchDecision';",
      "export const key = 'matchKey';",
      "export const safe = 'BuyerMatch';",
    ].join("\n"),
    "app/(workspace)/tasks/page.tsx": [
      "export const row = { ownerId: task.ownerId, owner: task.owner };",
    ].join("\n"),
    "prisma/schema.prisma": [
      "model Seller {",
      "  ownerId String? // the canonical Owner this deal contact represents",
      "}",
      "",
      "model Opportunity {",
      "  source String?",
      "}",
      "",
      "model Task {",
      "  ownerId String?",
      "  owner User? @relation(fields: [ownerId], references: [id])",
      "}",
      "",
      "model OwnerMatchDecision {",
      "  id String @id",
      "}",
    ].join("\n"),
  });

  try {
    const findings = findingsByRule(root);
    assert.deepEqual(Object.keys(findings).sort(), [
      "R-HOM-001",
      "R-HOM-002",
      "R-HOM-003",
      "R-RET-001",
      "R-SYN-002",
      "R-SYN-003",
    ]);
    assert.equal(findings["R-HOM-001"].length, 1);
    assert.equal(findings["R-RET-001"].length, 2);
    assert.equal(findings["R-SYN-002"].length, 2);
    assert.equal(findings["R-SYN-003"].length, 2);
    assert.equal(findings["R-HOM-002"].length, 3);
    assert.equal(findings["R-HOM-003"].length, 5);
    assert.ok(!Object.values(findings).flat().some((entry) => entry.includes("Pipeline handoff")));
    assert.ok(!Object.values(findings).flat().some((entry) => entry.includes("dealautomator.com/commercial-lead")));
    assert.ok(!Object.values(findings).flat().some((entry) => entry.includes("BuyerMatch")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("detector output is deterministic for an unchanged tree", () => {
  const root = makeRepo({
    "app/(workspace)/dashboard/page.tsx": "export default function Page() { return <p>Pipeline</p>; }\n",
    "prisma/schema.prisma": "model Opportunity {\n  source String?\n}\n",
  });

  try {
    const first = stableStringifyReport(runBe3Detector({ rootDir: root, config: detectorConfig as any }));
    const second = stableStringifyReport(runBe3Detector({ rootDir: root, config: detectorConfig as any }));
    assert.equal(first, second);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

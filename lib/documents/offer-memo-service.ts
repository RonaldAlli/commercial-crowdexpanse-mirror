// Offer-memo generation SERVICE (v1.3, offer-memo). Documents-owned orchestration:
// it reads the settled underwriting bundle through the single narrow underwriting
// seam, maps it to the pure input, assembles the canonical snapshot, renders the
// deterministic bytes, hashes them, and persists an append-only, immutable Document
// (OM-1/OM-4/OM-6/OM-7). It performs NO calculation (OM-3). The failure-safe order
// (OM-L) writes the file BEFORE the row and compensates on failure, so a Document row
// is never left pointing at a missing artifact. Authorization is enforced by the
// caller (the server action does the dual UNDERWRITING-read + DOCUMENT-write check).
import crypto from "node:crypto";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { buildStorageKey, persistFile, removeFile } from "@/lib/storage";
import { getScenarioForMemo, type ScenarioMemoBundle } from "@/lib/underwriting";

import {
  assembleOfferMemoSnapshot,
  renderOfferMemoHtml,
  OFFER_MEMO_GENERATOR_VERSION,
  OFFER_MEMO_SNAPSHOT_SCHEMA_VERSION,
  OFFER_MEMO_TEMPLATE_VERSION,
  type ScenarioMemoInput,
} from "./offer-memo";

const MEMO_MIME = "text/html; charset=utf-8";

/** SHA-256 of the final stored bytes — the memo's authoritative historical evidence (OM-6). */
export function sha256Hex(bytes: Buffer): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

/** Resolve a user id to a display name (falls back to the id when the user is gone). */
async function displayForUser(userId: string | null | undefined): Promise<string> {
  if (!userId) return "Unknown";
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  return u?.name ?? userId;
}

/** Map the persisted, settled bundle into the plain input the pure assembler consumes. */
async function toMemoInput(bundle: ScenarioMemoBundle): Promise<ScenarioMemoInput> {
  const { scenario, primaryCase, opportunity, property } = bundle;
  const r = scenario.result!;
  const cr = primaryCase.result!;
  const decisionRow = scenario.decisions[0] ?? null;

  return {
    opportunity: { id: opportunity.id, title: opportunity.title },
    property: {
      name: property.name,
      assetType: property.assetType,
      addressLine1: property.addressLine1,
      city: property.city,
      state: property.state,
      postalCode: property.postalCode,
      county: property.county,
      unitCount: property.unitCount,
    },
    scenario: {
      id: scenario.id,
      label: scenario.label,
      version: scenario.version,
      status: scenario.status,
      scenarioVersion: scenario.scenarioVersion,
      modelVersion: scenario.modelVersion,
      calcLibVersion: scenario.calcLibVersion,
      rulesetVersion: scenario.rulesetVersion,
      analystSummary: scenario.analystSummary,
    },
    operatingAssumptions: scenario.assumptions.map((a) => ({ key: a.key, value: a.valueNumeric.toNumber() })),
    result: {
      grossIncomeAnnualUsd: r.grossIncomeAnnualUsd,
      operatingExpensesUsd: r.operatingExpensesUsd,
      noiAnnualUsd: r.noiAnnualUsd,
      allInCostUsd: r.allInCostUsd,
      capRate: r.capRate,
      pricePerUnitUsd: r.pricePerUnitUsd,
      expenseRatioPct: r.expenseRatioPct,
      spreadUsd: r.spreadUsd,
    },
    primaryCase: {
      id: primaryCase.id,
      label: primaryCase.label,
      position: primaryCase.position,
      capitalAssumptions: primaryCase.capitalAssumptions.map((a) => ({ key: a.key, value: a.valueNumeric.toNumber() })),
      result: {
        annualDebtServiceUsd: cr.annualDebtServiceUsd,
        dscr: cr.dscr,
        debtYieldPct: cr.debtYieldPct,
        sizedLoanUsd: cr.sizedLoanUsd,
        bindingConstraint: cr.bindingConstraint,
        avgDscr: cr.avgDscr,
        cumulativeCashFlowUsd: cr.cumulativeCashFlowUsd,
        terminalNoiUsd: cr.terminalNoiUsd,
        exitCapRatePct: cr.exitCapRatePct,
        grossExitValueUsd: cr.grossExitValueUsd,
        netSaleProceedsUsd: cr.netSaleProceedsUsd,
        debtPayoffUsd: cr.debtPayoffUsd,
        contributedEquityUsd: cr.contributedEquityUsd,
        equityMultiple: cr.equityMultiple,
        leveredIrrPct: cr.leveredIrrPct,
        totalProfitUsd: cr.totalProfitUsd,
      },
    },
    findings: scenario.findings.map((f) => ({
      code: f.code,
      category: f.category,
      severity: f.severity,
      title: f.title,
      detail: f.detail,
      observedValue: f.observedValue,
      thresholdValue: f.thresholdValue,
    })),
    suggestedRecommendation: scenario.recommendation?.level ?? null,
    decision: decisionRow
      ? {
          id: decisionRow.id,
          sequence: decisionRow.sequence,
          level: decisionRow.decision,
          rationale: decisionRow.rationale,
          actorDisplay: await displayForUser(decisionRow.actorUserId),
          decidedAtIso: decisionRow.createdAt.toISOString(),
        }
      : null,
  };
}

export type GeneratedMemo = { id: string; generationSequence: number; contentSha256: string };

/**
 * Generate an offer memo from a LOCKED scenario and persist it as an append-only,
 * immutable Document (OM-7/OM-8). Fails closed via getScenarioForMemo (OM-2/OM-A).
 * Authorization is the caller's responsibility (OM-K).
 */
export async function generateOfferMemo(
  organizationId: string,
  scenarioId: string,
  actor: { id: string; display: string },
): Promise<GeneratedMemo> {
  // 1) Read the settled bundle (throws fail-closed) and map to the pure input.
  const bundle = await getScenarioForMemo(organizationId, scenarioId);
  const input = await toMemoInput(bundle);

  // 2) Assemble the canonical snapshot — the ONLY clock read is here (OM-F).
  const generatedAtIso = new Date().toISOString();
  const snapshot = assembleOfferMemoSnapshot(input, {
    generatedAtIso,
    generatedById: actor.id,
    generatedByDisplay: actor.display,
  });

  // 3) Render deterministic bytes + hash them (OM-6), all in memory.
  const bytes = Buffer.from(renderOfferMemoHtml(snapshot), "utf-8");
  const contentSha256 = sha256Hex(bytes);

  // 4) Allocate the final key and write the FILE FIRST (OM-L file-first ordering).
  const storageKey = buildStorageKey(organizationId, "offer-memo.html");
  await persistFile(storageKey, bytes);

  // 5) Reserve the sequence and create the row in one transaction; compensate on failure.
  let doc: GeneratedMemo;
  try {
    doc = await prisma.$transaction(async (tx) => {
      const max = await tx.document.aggregate({
        where: { sourceScenarioId: scenarioId, documentType: "OFFER_MEMO" },
        _max: { generationSequence: true },
      });
      const generationSequence = (max._max.generationSequence ?? 0) + 1;
      const created = await tx.document.create({
        data: {
          organizationId,
          opportunityId: bundle.opportunity.id,
          propertyId: bundle.property.id,
          title: `Offer memo — ${bundle.property.name} (v${bundle.scenario.version} #${generationSequence})`,
          documentType: "OFFER_MEMO",
          storageKey,
          originalFilename: `offer-memo-v${bundle.scenario.version}-${generationSequence}.html`,
          mimeType: MEMO_MIME,
          fileSizeBytes: bytes.length,
          origin: "GENERATED",
          sourceScenarioId: scenarioId,
          sourceScenarioVersion: bundle.scenario.version,
          scenarioVersionSnapshot: bundle.scenario.scenarioVersion,
          findingsVersionSnapshot: bundle.scenario.recommendation?.findingsVersion ?? null,
          decisionIdSnapshot: snapshot.humanDecision?.id ?? null,
          decisionSequenceSnapshot: snapshot.humanDecision?.sequence ?? null,
          templateVersion: OFFER_MEMO_TEMPLATE_VERSION,
          generatorVersion: OFFER_MEMO_GENERATOR_VERSION,
          snapshotSchemaVersion: OFFER_MEMO_SNAPSHOT_SCHEMA_VERSION,
          contentSnapshot: snapshot as unknown as Prisma.InputJsonValue,
          contentSha256,
          generatedById: actor.id,
          generatedAt: new Date(generatedAtIso),
          generationSequence,
        },
        select: { id: true, generationSequence: true, contentSha256: true },
      });
      return { id: created.id, generationSequence: created.generationSequence!, contentSha256: created.contentSha256! };
    });
  } catch (err) {
    // No row was committed — remove the orphaned file so nothing untracked remains.
    await removeFile(storageKey).catch(() => {});
    throw err;
  }

  // 6) Audit only after BOTH the row and the artifact exist (OM-12).
  await prisma.activityLog
    .create({
      data: {
        organizationId,
        actorId: actor.id,
        opportunityId: bundle.opportunity.id,
        propertyId: bundle.property.id,
        eventType: "offer_memo.generated",
        eventLabel: `Offer memo generated by ${actor.display}`,
        eventBody: `${bundle.property.name} · scenario v${bundle.scenario.version} · memo #${doc.generationSequence}`,
      },
    })
    .catch(() => {});

  return doc;
}

/** List an appended history of a scenario's generated memos, newest first (OM-7). */
export async function listGeneratedMemos(organizationId: string, scenarioId: string) {
  return prisma.document.findMany({
    where: { organizationId, sourceScenarioId: scenarioId, documentType: "OFFER_MEMO", origin: "GENERATED" },
    orderBy: { generationSequence: "desc" },
    select: {
      id: true,
      generationSequence: true,
      generatedAt: true,
      sourceScenarioVersion: true,
      contentSha256: true,
      originalFilename: true,
    },
  });
}

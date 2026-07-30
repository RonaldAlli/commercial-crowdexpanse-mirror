import { test } from "node:test";
import assert from "node:assert/strict";

import { buildClosingWorkspaceView, type ClosingWorkspaceInput, type DomainInput } from "@/lib/workspace-ui/closing-workspace";

const dom = (key: DomainInput["key"], o: Partial<DomainInput> = {}): DomainInput => ({
  key, present: false, started: false, terminal: false, statusLabel: "Not started", ...o,
});
const READY = { ready: true, requiredTotal: 3, requiredSatisfied: 3, outstandingCount: 0, blockMessage: null };
const NOT_READY = { ready: false, requiredTotal: 3, requiredSatisfied: 1, outstandingCount: 2, blockMessage: "2 required items outstanding." };
const base = (o: Partial<ClosingWorkspaceInput>): ClosingWorkspaceInput => ({
  hasChecklist: true, readiness: READY, blockerLabels: [], domains: [dom("escrow"), dom("financing"), dom("assignment")], ...o,
});

test("no checklist -> verdict 'not established' (honest, neither closeable nor not)", () => {
  const v = buildClosingWorkspaceView(base({ hasChecklist: false, readiness: null }));
  assert.equal(v.verdict.kind, "not-established");
  assert.equal(v.domains[0].key, "checklist");
  assert.equal(v.domains[0].state, "not-started");
});

test("checklist not ready -> 'not yet' with the existing block message; blockers preserved in order", () => {
  const v = buildClosingWorkspaceView(base({ readiness: NOT_READY, blockerLabels: ["Title commitment", "Survey"] }));
  assert.equal(v.verdict.kind, "not-yet");
  assert.equal(v.verdict.explanation, "2 required items outstanding.");
  assert.deepEqual(v.blockers, ["Title commitment", "Survey"]); // persisted order, not reprioritized
  assert.equal(v.domains[0].state, "in-progress"); // checklist domain outstanding
});

test("R4: checklist COMPLETE but an operational domain in progress -> NOT closeable (distinct verdict)", () => {
  const v = buildClosingWorkspaceView(base({
    readiness: READY,
    domains: [dom("escrow", { present: true, started: true, terminal: false, statusLabel: "Deposited" }), dom("financing"), dom("assignment")],
  }));
  assert.equal(v.verdict.kind, "checklist-complete-domains-outstanding");
  assert.match(v.verdict.explanation ?? "", /Checklist complete/);
  assert.match(v.verdict.explanation ?? "", /Escrow/); // names the outstanding domain
  assert.notEqual(v.verdict.kind, "yes"); // never implies closeable on checklist alone
  assert.deepEqual(v.blockers, ["Escrow: Deposited"]); // the in-progress domain surfaces as a blocker
});

test("checklist complete + all domains terminal/not-started -> 'yes'", () => {
  const v = buildClosingWorkspaceView(base({
    readiness: READY,
    domains: [
      dom("escrow", { present: true, started: true, terminal: true, statusLabel: "Released" }),
      dom("financing", { present: true, started: true, terminal: true, statusLabel: "Funded" }),
      dom("assignment", { present: true, started: true, terminal: true, statusLabel: "Executed" }),
    ],
  }));
  assert.equal(v.verdict.kind, "yes");
  assert.deepEqual(v.blockers, []);
});

test("domain states map from existing present/started/terminal; always four domains in order", () => {
  const v = buildClosingWorkspaceView(base({
    domains: [
      dom("escrow", { present: true, started: true, terminal: true, statusLabel: "Released" }), // resolved
      dom("financing", { present: true, started: true, terminal: false, statusLabel: "Applied" }), // in-progress
      dom("assignment", { present: false }), // not-started
    ],
  }));
  assert.deepEqual(v.domains.map((d) => d.key), ["checklist", "escrow", "financing", "assignment"]);
  const by = Object.fromEntries(v.domains.map((d) => [d.key, d.state]));
  assert.equal(by.escrow, "resolved");
  assert.equal(by.financing, "in-progress");
  assert.equal(by.assignment, "not-started");
});

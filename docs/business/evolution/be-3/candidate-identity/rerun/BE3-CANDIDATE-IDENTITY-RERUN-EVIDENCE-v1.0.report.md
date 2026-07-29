# BE3-CANDIDATE-IDENTITY-RERUN-v1 — Candidate Identity Corpus Rerun EVIDENCE (Increment 5B)

> EVIDENCE-ONLY — not a baseline, not accepted, not tagged, not authoritative. civ-1 remains authoritative.
> NONE — evidence only; no pass/fail threshold is defined or inferred. For governed review.

Manifest digest: `EM-97240ceb22d462cfdf170153`   corpusDigest: `7a1600e2fa5be590…`
Versions: fiv=fiv-1 civ=civ-2 cav=cav-1 msv=msv-1 detector=be3-detector-v1.0

## Confusion (hardened stack; groundTruth vs lineage-derived classification)
- true positives: 2
- false positives: 1
- true negatives: 3
- false negatives (total): 3
-   silent FN: 1
-   ambiguous FN: 2
- ambiguous (soft): 2
- ambiguous (expected): 2
- suspension: 2
- unclassified: 1

Per case:
- [original] genuine-new-drift [real-drift] → FN_ambiguous  (ambiguous, ambiguous)
- [original] duplicate-addition [real-drift] → FN_ambiguous  (ambiguous, ambiguous)
- [original] harmless-line-movement [harmless] → ambiguous_soft  (ambiguous, ambiguous)
- [original] file-rename [harmless] → TN  (renamed)
- [original] path-canonicalization [harmless] → ambiguous_soft  (ambiguous)
- [original] resolved-finding [harmless] → FP  (split)
- [original] reintroduced-violation [real-drift] → FN_silent  (sameCandidate, sameCandidate)
- [original] competing-match [ambiguous-by-design] → unclassified  (split)
- [original] incompatible-baseline [suspension] → suspension  (—)
- [added] add-classification-independence [harmless] → TN  (sameCandidate)
- [added] add-verified-rename-continuity [harmless] → TN  (renamed)
- [added] add-ambiguous-competing-rename [ambiguous-by-design] → ambiguous_expected  (ambiguous)
- [added] add-reintroduction-reopened [real-drift] → TP  (reintroduced)
- [added] add-split-new-occurrence [real-drift] → TP  (sameCandidate, split)
- [added] add-indistinguishable-duplicates [ambiguous-by-design] → ambiguous_expected  (ambiguous, ambiguous)
- [added] add-candidate-identity-version-suspension [suspension] → suspension  (—)

## Candidate-identity stability (hardened vs prior v1.0)
- classificationIndependence: v1.0=false → hardened=true  (CHANGED)
- renames: v1.0=false → hardened=true  (CHANGED)
- repeats: v1.0=true → hardened=true
- removeReintroduce: v1.0=true → hardened=true
- pathCanonicalization: v1.0=true → hardened=true
- baselineEvolution: v1.0=false → hardened=true  (CHANGED)
- candidateIdentityVersion suspension: v1.0=not-wired → hardened=wired

## Migration mapping evidence
summary: {"oneToOne":2,"oneToMany":1,"manyToOne":2,"unmapped":1,"ambiguous":1,"total":7,"reviewRequired":5}
review queue: C-civ1-ambiguous, C-civ1-merge-a, C-civ1-merge-b, C-civ1-split, C-civ1-unmapped

## Compatibility suspension matrix
- findingIdentityVersion → suspended
- candidateIdentityVersion → suspended
- classificationAlgorithmVersion → suspended
- detectorVersion → suspended
- ruleSetHash → suspended
- scopeHash → suspended
- measurementSeriesId → suspended
- baselineTag → suspended
- migrationSchemaVersion (via manifest) → suspended
- all version fields suspend: true

## Review queues (deterministic)
- ambiguous: add-ambiguous-competing-rename, add-indistinguishable-duplicates, duplicate-addition, genuine-new-drift, harmless-line-movement, path-canonicalization
- suspended: add-candidate-identity-version-suspension, incompatible-baseline
- unresolved/rejected: —
- non-one-to-one migration: C-civ1-ambiguous, C-civ1-merge-a, C-civ1-merge-b, C-civ1-split, C-civ1-unmapped

## Governance questions (answered with evidence; NOT judged)
- Q1 Are known material gaps closed? — judgment: DEFERRED TO GOVERNED REVIEW
- Q2 Are silent false negatives present? — judgment: DEFERRED TO GOVERNED REVIEW
- Q3 Is rename stability demonstrated? — judgment: DEFERRED TO GOVERNED REVIEW
- Q4 Is baseline-evolution stability demonstrated? — judgment: DEFERRED TO GOVERNED REVIEW
- Q5 Are ambiguities preserved (never downgraded)? — judgment: DEFERRED TO GOVERNED REVIEW
- Q6 Are non-one-to-one migration mappings surfaced? — judgment: DEFERRED TO GOVERNED REVIEW
- Q7 Is compatibility suspension complete across all version fields? — judgment: DEFERRED TO GOVERNED REVIEW
- Q8 Is the package deterministic and reproducible? — judgment: DEFERRED TO GOVERNED REVIEW

Self-check (determinism): consistent (byte-identical)

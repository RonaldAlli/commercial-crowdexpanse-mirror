BE3 Blocking Readiness Evaluation — EVIDENCE (read-only, non-blocking, no threshold)
baselineTag: be3-candidate-mode-v1.0   findingIdentityVersion: fiv-1
candidateIdentityVersion: civ-1 (proposed; not yet enforced by the classifier)

Confusion (case-level, groundTruth vs classifier):
  true positives: 2
  false positives: 0
  true negatives: 4
  false negatives (total): 1
    silent false negatives: 0
    ambiguous false negatives: 1
  ambiguous findings: 4
  unclassified: 0

Per case:
  genuine-new-drift [real-drift] → TP
  duplicate-addition [real-drift] → TP
  harmless-line-movement [harmless] → TN
  file-rename [harmless] → TN
  path-canonicalization [harmless] → TN
  resolved-finding [harmless] → TN
  reintroduced-violation [real-drift] → FN_ambiguous
  competing-match [ambiguous-by-design] → ambiguous_expected
  incompatible-baseline [suspension] → suspension

Candidate-identity stability:
  classificationIndependence: false
  renames: false
  repeats: true
  removeReintroduce: true
  pathCanonicalization: true
  baselineEvolution: false

Exception simulations:
  R-RET-001 9786bd4e1e2324b7 @2026-07-30 → active(suppressed→logged)
  R-RET-001 9786bd4e1e2324b7 @2026-08-02 → expired→candidate-new
  R-RET-001 9786bd4e1e2324b7 @2026-07-30 → revoked→candidate-new

Compatibility suspension outcomes:
  detectorVersion changed → suspended
  ruleSetHash changed → suspended
  scopeHash changed → suspended
  measurementSeriesId changed → suspended
  findingIdentityVersion changed → suspended
  candidateIdentityVersion changed → not-wired
  baselineTag changed → n/a

Self-check (determinism): consistent

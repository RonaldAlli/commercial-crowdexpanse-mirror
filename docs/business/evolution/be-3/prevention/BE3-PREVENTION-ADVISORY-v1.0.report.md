BE3-PREVENT · Phase 3 advisory prevention report
Mode: advisory
Baseline tag: be3-measurement-baseline-v1.0
Accepted measurement series: 41f04b6234d74e194ab5541f18e9c7318bf252861d9805f27a3d2cc2787b5808
Reason: compatible advisory evaluation

Summary:
- Grandfathered findings: 117
- New drift findings: 0
- Informational findings: 0
- Total evaluated findings: 117

Compatibility:
- Compatible: true
- No compatibility issues detected.

New drift:
- None.

Grandfathered:
- R-SYN-002 app/(workspace)/acquire/AcquisitionCockpit.tsx:66 → next targets
- R-SYN-002 app/(workspace)/acquire/AcquisitionCockpit.tsx:67 → target the session
- R-SYN-002 app/(workspace)/acquire/AcquisitionCockpit.tsx:196 → next targets
- R-SYN-002 app/(workspace)/acquire/AcquisitionCockpit.tsx:199 → Next targets
- R-SYN-002 app/(workspace)/acquire/page.tsx:130 → current target
- R-RET-001 app/(workspace)/acquire/page.tsx:174 → lead
- R-HOM-001 app/(workspace)/dashboard/page.tsx:158 → Pipeline
- R-SYN-004 app/(workspace)/insights/page.tsx:94 → Closed-won
- R-SYN-003 app/(workspace)/opportunities/[id]/edit/page.tsx:58 → source
- R-SYN-003 app/(workspace)/opportunities/[id]/page.tsx:416 → source
- R-RET-001 app/(workspace)/opportunities/[id]/page.tsx:579 → lead
- R-HOM-001 app/(workspace)/opportunities/[id]/page.tsx:728 → Pipeline
- R-SYN-003 app/(workspace)/opportunities/actions.ts:43 → source
- R-SYN-003 app/(workspace)/opportunities/actions.ts:93 → source
- R-RET-001 app/(workspace)/opportunities/actions.ts:112 → lead
- R-SYN-003 app/(workspace)/opportunities/actions.ts:187 → source
- R-RET-001 app/(workspace)/opportunities/page.tsx:112 → lead
- R-SYN-003 app/(workspace)/opportunities/page.tsx:173 → source
- R-SYN-003 app/(workspace)/opportunities/page.tsx:214 → source
- R-HOM-002 app/(workspace)/owners/[id]/page.tsx:53 → matchKey
- R-HOM-002 app/(workspace)/owners/[id]/page.tsx:67 → matchKey
- R-HOM-002 app/(workspace)/owners/actions.ts:16 → matchKey
- R-HOM-002 app/(workspace)/owners/candidates/actions.ts:10 → owner-match
- R-HOM-002 app/(workspace)/owners/candidates/actions.ts:13 → OwnerMatchDecision
- R-HOM-002 app/(workspace)/owners/candidates/page.tsx:10 → owner-match
- R-HOM-002 app/(workspace)/owners/candidates/page.tsx:16 → alias-match
- R-HOM-002 app/(workspace)/owners/candidates/page.tsx:16 → exact-match-key
- R-HOM-002 app/(workspace)/owners/merges/page.tsx:10 → owner-match
- R-HOM-002 app/(workspace)/owners/page.tsx:42 → matchKey
- R-HOM-002 app/(workspace)/owners/page.tsx:53 → matchKey
- R-HOM-002 app/(workspace)/owners/page.tsx:136 → matchKey
- R-HOM-002 app/(workspace)/properties/[id]/link-owner/page.tsx:29 → matchKey
- R-HOM-002 app/(workspace)/properties/candidates/actions.ts:10 → property-match
- R-HOM-002 app/(workspace)/properties/candidates/actions.ts:10 → PropertyMatchDecision
- R-HOM-002 app/(workspace)/properties/candidates/actions.ts:13 → PropertyMatchDecision
- R-HOM-002 app/(workspace)/properties/candidates/actions.ts:23 → PropertyMatchDecision
- R-HOM-002 app/(workspace)/properties/candidates/actions.ts:53 → PropertyMatchDecision
- R-HOM-002 app/(workspace)/properties/candidates/page.tsx:10 → property-match
- R-RET-001 app/(workspace)/settings/imports/page.tsx:30 → lead
- R-RET-001 app/(workspace)/settings/imports/page.tsx:50 → lead
- R-HOM-003 app/(workspace)/tasks/[id]/edit/page.tsx:30 → ownerId
- R-HOM-003 app/(workspace)/tasks/[id]/edit/page.tsx:32 → ownerId
- R-HOM-003 app/(workspace)/tasks/[id]/edit/page.tsx:54 → ownerId
- R-HOM-003 app/(workspace)/tasks/[id]/page.tsx:22 → owner
- R-HOM-003 app/(workspace)/tasks/[id]/page.tsx:34 → owner
- R-HOM-003 app/(workspace)/tasks/actions.ts:26 → owner
- R-HOM-003 app/(workspace)/tasks/actions.ts:54 → ownerId
- R-HOM-003 app/(workspace)/tasks/actions.ts:55 → ownerId
- R-HOM-003 app/(workspace)/tasks/actions.ts:56 → owner
- R-HOM-003 app/(workspace)/tasks/actions.ts:57 → ownerId
- R-HOM-003 app/(workspace)/tasks/actions.ts:60 → owner
- R-HOM-003 app/(workspace)/tasks/actions.ts:61 → owner
- R-HOM-003 app/(workspace)/tasks/actions.ts:61 → ownerId
- R-HOM-003 app/(workspace)/tasks/actions.ts:71 → ownerId
- R-HOM-003 app/(workspace)/tasks/actions.ts:127 → ownerId
- R-HOM-003 app/(workspace)/tasks/page.tsx:45 → owner
- R-HOM-003 app/(workspace)/tasks/page.tsx:142 → owner
- R-RET-001 app/login/page.tsx:8 → lead
- R-SYN-004 lib/business-intelligence/queries.ts:67 → Closed-won
- R-HOM-002 lib/intelligence/owner-duplicates.ts:5 → matchKey
- R-HOM-002 lib/intelligence/owner-duplicates.ts:11 → matchKey
- R-HOM-002 lib/intelligence/owner-duplicates.ts:15 → alias-match
- R-HOM-002 lib/intelligence/owner-duplicates.ts:15 → exact-match-key
- R-HOM-002 lib/intelligence/owner-duplicates.ts:30 → matchKey
- R-HOM-002 lib/intelligence/owner-duplicates.ts:36 → matchKey
- R-HOM-002 lib/intelligence/owner-duplicates.ts:37 → matchKey
- R-HOM-002 lib/intelligence/owner-duplicates.ts:39 → matchKey
- R-HOM-002 lib/intelligence/owner-duplicates.ts:46 → exact-match-key
- R-HOM-002 lib/intelligence/owner-duplicates.ts:46 → matchKey
- R-HOM-002 lib/intelligence/owner-duplicates.ts:47 → alias-match
- R-HOM-002 lib/intelligence/owner-duplicates.ts:47 → matchKey
- R-HOM-002 lib/intelligence/owner-duplicates.ts:63 → matchKey
- R-HOM-002 lib/intelligence/owner-duplicates.ts:66 → matchKey
- R-HOM-002 lib/intelligence/owner-duplicates.ts:68 → matchKey
- R-HOM-002 lib/intelligence/owner-duplicates.ts:72 → exact-match-key
- R-HOM-002 lib/intelligence/owner-duplicates.ts:76 → matchKey
- R-HOM-002 lib/intelligence/owner-duplicates.ts:83 → matchKey
- R-HOM-002 lib/intelligence/owner-duplicates.ts:85 → alias-match
- R-HOM-002 lib/intelligence/owner-duplicates.ts:85 → matchKey
- R-HOM-002 lib/intelligence/owner-identity.ts:19 → alias-match
- R-HOM-002 lib/intelligence/owner-identity.ts:19 → exact-match-key
- R-HOM-002 lib/intelligence/owner-identity.ts:31 → matchKey
- R-HOM-002 lib/intelligence/owner-identity.ts:88 → matchKey
- R-HOM-002 lib/intelligence/owner-identity.ts:89 → exact-match-key
- R-HOM-002 lib/intelligence/owner-identity.ts:91 → alias-match
- R-HOM-002 lib/intelligence/projection.ts:5 → matchKey
- R-HOM-002 lib/intelligence/projection.ts:34 → matchKey
- R-HOM-002 lib/intelligence/projection.ts:44 → matchKey
- R-HOM-002 lib/intelligence/property-resolver.ts:21 → property-match
- R-HOM-002 lib/intelligence/provenance.ts:178 → matchKey
- R-HOM-002 lib/intelligence/provenance.ts:183 → matchKey
- R-HOM-002 lib/owner-match.ts:4 → OwnerMatchDecision
- R-HOM-002 lib/owner-match.ts:17 → matchKey
- R-HOM-002 lib/owner-match.ts:19 → matchKey
- R-HOM-002 lib/owner-match.ts:89 → matchKey
- R-HOM-002 lib/owner-match.ts:92 → matchKey
- R-HOM-002 lib/property-match.ts:6 → owner-match
- R-HOM-002 lib/property-match.ts:103 → PropertyMatchDecision
- R-HOM-002 lib/property-match.ts:125 → PropertyMatchDecision
- R-HOM-002 prisma/schema.prisma:375 → OwnerMatchDecision
- R-HOM-002 prisma/schema.prisma:377 → PropertyMatchDecision
- R-HOM-002 prisma/schema.prisma:509 → matchKey
- R-HOM-002 prisma/schema.prisma:511 → OwnerMatchDecision
- R-HOM-002 prisma/schema.prisma:517 → alias-match
- R-HOM-002 prisma/schema.prisma:517 → exact-match-key
- R-HOM-002 prisma/schema.prisma:549 → matchKey
- R-HOM-002 prisma/schema.prisma:564 → matchKey
- R-SYN-002 prisma/schema.prisma:900 → deal contact
- R-HOM-002 prisma/schema.prisma:1100 → OwnerMatchDecision
- R-HOM-002 prisma/schema.prisma:1135 → OwnerMatchDecision
- R-HOM-002 prisma/schema.prisma:1136 → PropertyMatchDecision
- R-SYN-003 prisma/schema.prisma:1165 →   source           String?
- R-HOM-003 prisma/schema.prisma:1768 → ownerId
- R-HOM-003 prisma/schema.prisma:1777 → owner
- R-HOM-003 prisma/schema.prisma:1777 → ownerId
- R-HOM-003 prisma/schema.prisma:1781 → ownerId
- R-RET-001 scripts/import-dealautomator-commercial-leads.ts:257 → lead

Informational:
- None.

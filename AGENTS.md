# Instructions for coding agents

## Shared Curiosity Loop architecture

Before designing, coding or reviewing any Curiosity Loop v1 work module, read the shared records in `rasnag/Curiosity-Loop`:

1. [Source of truth and current approvals](https://github.com/rasnag/Curiosity-Loop/blob/main/SOURCE_OF_TRUTH.md).
2. [Engineering architecture entry point](https://github.com/rasnag/Curiosity-Loop/blob/main/approved/engineering-v1/README.md).
3. [Exact engineering design v1.2](https://github.com/rasnag/Curiosity-Loop/blob/ac8a063b1d0d382c3108d2dc50572a0c4eb707b2/approved/engineering-v1/ENGINEERING_DESIGN_V1.md).
4. [Module reading guide](https://github.com/rasnag/Curiosity-Loop/blob/main/approved/engineering-v1/MODULE_GUIDE.md) and [remaining review notes](https://github.com/rasnag/Curiosity-Loop/blob/main/approved/engineering-v1/REVIEW_NOTES.md).
5. The applicable approved product requirements, task specification and execution authorization in that repository.

Rasna directed this shared reference on November 10, 2026 (DECISION-031 / APPROVAL-004). The pinned v1.2 design SHA-256 is `02adc2e0bf0910092f0888a126cdebe98adc35a177679bf124e0e79393532b79`. Refresh the approval register for later exact promoted versions; a newer agent draft does not supersede it.

This repository contains application implementation; Curiosity-Loop contains shared planning authority. Do not maintain a divergent architecture copy here. Cite the architecture version/digest and relevant interfaces, transaction boundaries and failure invariants in each module result. Preserve existing public demos and make changes only within the authorized card scope. If shared context is inaccessible, obtain a verified copy and identify the missing evidence rather than proceeding from memory.

Explicitly open provider, offer, privacy, capacity and eligibility/expiry gates remain open. The architecture's nonblocking review findings accompany the reference and must be handled in the affected authorized work. Architecture promotion does not grant task execution, model spending, provisioning, messaging, deployment or family admission. A planning-repository check is not an application test; verify the actual integrated application changes under the applicable task and test adapter.

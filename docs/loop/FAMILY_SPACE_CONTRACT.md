# Private family space — local synthetic contract

CODEX-03-A candidate, November12,2026. Awaiting actual checks, full native evidence and independent feature review; not accepted or released. Engineeringv1.2 SHA25602adc2e0bf0910092f0888a126cdebe98adc35a177679bf124e0e79393532b79; ADR-E02, household/consent lock order, current-epoch profiles, immutable revision lineage and acknowledged-only checkpoint rules apply. Ordinary prerequisites02-C/01-B/00-C are accepted; no new privacy or owner-policy exception.

## Scope and remaining handoffs

This consumer implements family selection and private saved-only/request/ready/play/previous/allowance projections. Empty capture is a real child-scoped RAM textarea, explicitly unsent and not saved. It does not implement04-A SaveWonder/SubmitProduction. An existing assignment opens its exact validated immutable introduction; an existing play opens its actual acknowledged receipt. New private Start/grants/delivery remain08-A. These open downstream F04 obligations are not claimed complete. No queue, billing, trial activation, model calls, public access, email or production publishing is created by reads/opens.

## Trusted construction and authority

createSyntheticFamilySpace receives exact own-data options env,db,access,content,play,policyVersion and optional clock. Only frozen index/read/open are returned. Disconnected local-synthetic and TEST-v1 are mandatory before DB effects. Actual disposable PGlite/migration8 is required; later migrations do not invalidate it. Safe integer Date clock only. Trusted own data methods are captured without invoking getters: access.withSession, content.question/revision and accepted play.resume/reconcile. HTTP/browser payloads never configure them.

Every private lookup uses the current accepted adult session, server-derived household membership, latest active TEST permission and current-epoch child_setup_profiles. Any retained older-epoch profile gives setup_unavailable; no initial profile gives setup_required. Context is SHA256(JSON.stringify(['synthetic-family-space-v1',adultId,householdId,consentEpoch,'TEST-v1'])); it is non-authorizing and compared only after current authorization. Siblings/account/epoch/profile-version changes clear private intent. IDs/context stay in RAM, never URLs, DOM attributes, browser storage or logs. Household/adult IDs are omitted from family responses; accepted play receipts retain their existing required scope fields.

## Read interfaces and evidence

index(sessionToken) returns exact family_space/synthetic_only/policy_version/state base. Permission/setup failures carry no child data. select_child adds view_context and minimal children child_id/profile_version/nickname/is_initial; initial first, stable UUID ordering thereafter.

read(sessionToken,{view_context,child_id}) returns child_space, current minimal children/selected_child and saved_wonders,requests,ready,plays,previous,allowances. All sources are canonical SQL and trusted scoped payload resolvers, never browser arrays. A fixture bound100 detects overflow and fails unavailable; it never truncates commitments and is not a live admission cap. Saved-only has no original_received_at, claim/capacity/assignment or due promise. Question source keeps exact bytes and is separate from interpretation; source_scope_version is explicit. Resolver results are exactly {question}, nonblank <=4000 characters; malformed/extra/missing data fails closed.

Requests require original immutable receipt plus coherent committed claim/capacity facts. received_at and due_at remain the original receipt and plus86400000ms. State is received(pending),accepted(reserved),ready(consumed with completed capacity/published assignment),closed(released). overdue is true only for unresolved received/accepted work after the original due time. Late work stays visible. No inferred founder generation/review history.

Ready items are exact assignment_id,request_id,revision_id,source_scope_version,question. Original revision source is resolved independently from any newer corrected request source. Published SQL relations are explicitly invented relational fixtures, not factual/human content approval. Adventure resolution validates the accepted finite engine1/engine2 schema and exact revision/pattern/engine pins; no executable content or fallback revision.

Each play retains its own identity, even repeated plays of one assignment. A confirmed summary uses actual accepted resume receipt/current checkpoint and exact last_action_sequence/trial_count. Any current unacknowledged candidate becomes confirmation_pending without counts/checkpoint or stale Saved claim. Passive read never reconciles or mutates domain tables. Journal IO is outside actor transactions. All current adult/permission/child/binding/checkpoint facts are rechecked before disclosure, otherwise fail unavailable. previous uses exact ready-item shape, deduplicated by assignment only after actual acknowledged tries; it means Previously tried, not completion/learning/aha or inferred chronology.

Allowances project actual committed periods/claim totals, shared household versus child scope, real start/end and active/expired status. Remaining excludes pending/reserved/consumed; released remains distinct. Sibling-specific periods are excluded. No period is created by viewing. Expiry preserves existing permitted assignments/progress; no live price, activation value or manual-payment arrangement is selected here.

## Open and transport

open accepts exact assignment command view_context,child_id,entry_kind='assignment',assignment_id,revision_id; entry_kind='play' additionally requires play_id. Current owned exact bindings precede source reads. Introduction returns current selected child, exact assignment, validated adventure and context, with no Start/write. Play reads actual existing resume and may explicitly reconcile that same pending receipt outside actor locks. Current authority, profile, assignment and checkpoint are rechecked after IO. Pending returns base confirmation_pending without private content/checkpoint. No fallback play or new play is created.

The optional trusted family adapter adds GET/adult/family, POST/adult/family/read and POST/adult/family/open, exact body unions, same current cookie and all accepted Host/Origin/body/identity guards. No capabilities/fixture inbox are exposed. Static family+trailing route only, same query/cross-site rules. UI route only when DEV/development/VITE_LOOP_PREVIEW1; production/flag-off retains About and public demos. No private data is bundled.

## Browser and verification boundary

Async generations/sequence guards prevent prior sibling/account/open/read results from restoring private state.15s/focus/pageshow rechecks preserve same-context draft/focus and invalidate old opens. Confirmed scope/access changes clear intent; transient failures hide details with honest retry. Listeners/timers clean up. Labeled select/textarea, heading/status/alert,320px wrapping and44px controls/links are required; native layout is not established by React tests.

Preliminary isolated draft: real protected PostgreSQL/HTTP service probe PASS; actual React through real HTTP PASS including siblings, held late read/open, account change, transient retry/draft, withdrawal/reconsent and expiry; cumulative76 selector identities PASS. These do NOT accept the app card. Full exact candidate app tests/build/protected regressions, eight actual native scenarios and actual feature Claude pass must occur after setup activation. Link-only change to accepted child screen requires exact diff plus native regression confirmation. All real data, privacy, provider, spending, public release and human content review gates remain closed.


## Open downstream interfaces — required completion-record handoff

-04-A consumes UnsentWonderDraft: the current home.view_context, selected_child.child_id/profile_version and verbatim draft string held in LoopFamilyHome RAM. Wire actual SaveWonder and explicit production-confirmation UX; unsent capture currently creates no saved or submitted result.
-04-B supplies SubmitProduction atomic allowance/capacity/original-receipt semantics behind that UX; no request is submitted by03-A.
-04-C supplies F06 request management/CancelRequest, clarification and status changes; approved04-C explicitly owns cancellation.03-A shows pending details but does not cancel them. This corrects the review's broad04-A/04-B cancellation shorthand against the approved card.
-08-A consumes OpenFamilyEntry: family.open's exact context/child/assignment/revision and optional existing play selection, for the private-grant/Start boundary. Current exact introduction/acknowledged receipt opening never starts a new play.

The actual03-A completion/acceptance record must repeat these open obligations and interface names; later cards must wire them rather than assume producer behavior exists. For remaining=0, show factual no-allowance copy with no invented next date, price or continuation channel. For an expired actual period, show Trial ended and preserve submission-time eligibility for existing requests under DECISION-033; fresh production needs a current check. The native allowance-trial scenario must observe zero or expired copy. Actual app integration tests cover a real full period and real CancelRequest kernel release/closed-not-overdue, accepted-overdue and unchanged original due times; this test fixture is not production cancellation implementation.

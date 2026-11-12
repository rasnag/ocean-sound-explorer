# Local synthetic adult access — CODEX-02-B

Draft implementation contract, November 11, 2026. No technical acceptance is claimed.

Authority: DECISION-039 / APPROVAL-006 permits only the local invented-account/mock-capture slice before provider and adult-identity-policy inputs. CODEX-01-B, CODEX-01-C and CODEX-00-C remain dependencies. Engineering architecture v1.2, APPROVAL-004, registered SHA-256 `02adc2e0bf0910092f0888a126cdebe98adc35a177679bf124e0e79393532b79` governs ADR-E01/E02/E05 and WM-02 VerifyAdult. RecordConsent/CreateChild are not implemented here. Restricted identity is separate from child-content authority, including after withdrawal.

## Trust and configuration

`createSyntheticAdultAccess({db,env,clock,policy,deliver})` validates `resolveLoopConfig(env)` first. Production and preview remain unconfigured and fail closed. The database must be the installed real PGlite engine with migration006 already registered; fake transaction/query objects are rejected. The caller owns the disposable local engine and migrations. There is no connected database URL or external transport.

All six policy fields are mandatory positive safe integers: challengeTtlMs, sessionTtlMs, resendCooldownMs, requestWindowMs, maxRequests and maxVerifyAttempts. There are no production defaults. Time arithmetic must remain within finite JavaScript Date bounds. Tests use respectively 120000, 600000, 1000, 60000, 20 and 30. These are provisional synthetic fixture parameters, not adult identity, retention, public abuse or product policy.

`deliver` is a trusted constructor-owned in-process capture callback. It receives exactly `{email,purpose,token}`; the token is a freshly random32-byte base64url challenge, never a URL or session token. It receives no session data. No request chooses an adapter, destination, clock or policy. A fixed two-second callback timeout bounds local faults; it selects no external delivery SLA. No logger or console receives request contents or secrets.

Only normalized ASCII invented addresses under the exact example.invalid domain are accepted. The local part is1–64 characters, begins with a letter/digit and thereafter permits letters, digits, dot, underscore, plus and hyphen. Normalized total length is at most80; raw input is at most160. Subdomains, Unicode lookalikes and real domains fail. Purpose is exactly join or recover. UUIDs used in trusted setup are validated. Unknown fields fail validation.

## Service interfaces and transactions

| Interface | Result and effects |
| --- | --- |
| request({email,purpose}) | Syntactically valid requests return check_inbox for known, unknown, disabled and throttled cases. Unknown recovery creates no account, household or challenge and captures nothing. Eligible join creates only a challenge until consumption. |
| verify({token}) | Invalid, expired, pending-delivery, replayed or replaced codes return exactly invalid_link. Success returns verified, sessionToken, adultId, householdId and restricted:true to trusted server code only. |
| session(sessionToken) | restricted plus opaque adult/household UUIDs, or signed_out. Rechecks current enabled identity, household existence, expiry and revocation each time. |
| logout(sessionToken) | Idempotent revocation and signed_out; malformed/missing secrets are safe. |
| seedAccount({email,adultId,householdId}) | Trusted setup only. Creates invented mapping; never changes an existing mapping or re-enables a disabled account. No HTTP route exists. |

Migration006 adds adult_accounts, adult_challenges, adult_sessions and persistent global/address throttles. Older migrations remain untouched. Secrets are stored only as SHA-256 hashes. Foreign keys bind known challenges to the exact adult/household/address. Mapping updates are prohibited. Unbound join tokens cannot be reinterpreted as a later-created account. Household deletion cascades access state.

Every service state transition uses an actual PostgreSQL transaction. A singleton issuer row is locked first, followed by existing household, account, challenge and session rows as needed. The coarse issuer lock also serializes otherwise unrelated local addresses; it is deliberately conservative. Existing household locks precede identity/challenge/session locks. A newly verified join creates a previously nonexistent household within the transaction; there is no preexisting household row to lock. Setup, session and logout use the same ordering. Deadlock/serialization failures retry at most three times without redelivering or logging the failed payload.

Both global budgets use requestWindowMs and persist across service reconstruction. All syntactically valid requests consume the request budget, including unknown recovery and cooldown suppression. Verification attempts, including malformed token values, consume the verification budget. Exhaustion produces the same generic result as normal suppression/invalidity. A clock going backwards cannot refresh a budget. Address cooldown spans both purposes; an eligible resend revokes all older unconsumed challenges for that address/purpose. Partial unique indexes prevent multiple unrevoked challenges per address/purpose and sessions per adult.

Challenge insertion and replacement commit before the mock callback. Pending delivery cannot verify. Successful callback completion marks the challenge delivered in a second transaction. A callback fault or timeout returns a sanitized unavailable error and attempts revocation; its captured code cannot verify because it was never marked delivered. The request budget/cooldown remain spent. A resend racing callback completion can leave a captured older code invalid; no successful verification is claimed. Database faults return sanitized unavailable errors, never SQL, contact or token details.

Successful consumption, optional new invented household/account, revocation of all older adult sessions and fresh session insertion commit together. Replay cannot mint another identity or session. Known join and recovery preserve mapping. Account disable/deletion immediately prevents later session authorization. No child, consent, entitlement, assignment, wonder or founder-session row is created or used.

Concurrent interleaving tests run on single-connection PGlite: real multi-connection PostgreSQL lock behavior remains unverified. Transaction locks and constraints are retained; this limitation is not production concurrency evidence. Independent durable recovery/journal infrastructure remains gated and is not represented as implemented by this disposable issuer.

## Actual HTTP boundary

`createSyntheticAdultAccessServer({access,env,serve})` returns a real Node HTTP server. Only explicit numeric-port IPv4 `127.0.0.1` listen calls are permitted; sockets, handles, omitted host and wildcard/IPv6 hosts are rejected. Actual bound host/port determines the accepted Host and Origin, not forwarded headers.

| Method/path | Exact JSON input | JSON response |
| --- | --- | --- |
| POST /adult/request | email,purpose | check_inbox or generic validation/unavailability error |
| POST /adult/verify | token | verified/restricted:true, or exactly invalid_link with HTTP200 |
| GET /adult/session | No identity input | restricted UUID scope or signed_out |
| POST /adult/logout | Empty object | signed_out |

POST API requests require exactly one matching Origin; missing and foreign Origins return403. A supplied foreign Origin is also rejected on reads. Host duplication/mismatch, forwarded headers, Authorization/bearer and identity/role headers are rejected. Cookies are strictly parsed, duplicate/malformed cookies rejected, and the adult cookie is the only API session transport. Incidental syntactically valid cookies are permitted on trusted non-API assets and confer no identity. JSON has exact field sets, a4096-byte bound, UTF-8 validation and a JSON content-type requirement; compression is unsupported. Query-bearing adult API paths fail generically. No inbox, seed, fault-clock, throttle, child or founder endpoint exists.

Verification response bodies never include either secret. The server sets loop_adult_session with HttpOnly, SameSite=Strict, Path=/adult and no Domain. This deliberately local HTTP cookie has no Secure attribute and is not a production cookie policy. All responses have no-store/no-referrer; no private shared caching is supported. Unknown routes return generic404 without account data. Failure details never echo malformed content.

An optional trusted serve(req,res) callback serves only GET development entry/assets on this same server. It is awaited along with response finish, including middleware that returns early. The allowlist includes the local preview entry, app/lib/components/node_modules and Vite development paths. It does not mount arbitrary application routes or fixture-control APIs. The controller owns launching the same-origin Vite fixture; no package/build/deployment configuration changes are included.

## UI and review boundary

The actual main.tsx selector adds /loop-preview/join and trailing slash under the existing exact DEV/development/VITE_LOOP_PREVIEW=1 gate. Only those three public fields are passed to the client helper. Existing public/player/discovery/saved routing remains in place.

The form is explicitly Local synthetic test with Invented email address, Send test link, Join/Recover access, check-inbox, Test link code, Verify test link, generic invalid/retry/help, restricted status and Sign out. It never says an actual email was sent. A one-second presentation pause follows requests; only server policy enforces resend eligibility, and a generic check-inbox result does not prove capture or verification. Developer code handoff occurs outside HTTP.

Entered fields clear after use. Resend retains only the normalized invented address in component memory until verification/return/unmount. There is no persistent browser storage, URL token handling, auto-verification, service worker or console logging. Mutations are queued; generation counters discard obsolete responses, and a stale successful verification is followed by logout. Sign-out clears identity immediately and queues server revocation after earlier mutations. Focus/pageshow/visible return checks server authority; restricted sessions are also polled every15 seconds. Revalidation clears displayed scope while awaiting confirmation. A failed network operation reports uncertainty without granting access. An explicit sign-out suppresses later passive restoration until a new intentional verification succeeds.

Root adult-root carries scope attributes only while restricted. adult-status exposes loading/request/check-inbox/invalid-link/restricted/error/signed-out. Labels, polite status, explicit-action status focus, visible keyboard focus, wrapping layout and44px-or-larger controls are authored for320px use. Native CUA, rendered accessibility/layout observations and late-response interactions remain controller verification work, not observations from this drafting turn.

## Gates and downstream handoff

No real-age, parental-authority, COPPA, consent, trial, booking, admission or production-security claim is supplied. G-E03 privacy/provider/retention/identity policy, offer, capacity/support, production recovery capability and release gates remain open. DECISION-033's recorded eligibility decision is not changed; this card creates no eligibility machinery. Architecture review obligations for independent journal reconciliation, keys and provider dispatch remain with their owning authorized modules; no provider call exists here.

CODEX-02-C still requires CODEX-10-B, which still requires CODEX-10-A. WM-08 recovery consumers must preserve this restricted scope rather than promote it into child access. No other card or accepted implementation source is changed. Controller checks, native CUA and independent Claude review must precede any delegated technical acceptance.

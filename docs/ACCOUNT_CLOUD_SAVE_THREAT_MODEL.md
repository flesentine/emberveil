# Emberveil Accounts and Cloud Saves Threat Model

Status: implementation gate  
Last reviewed: 2026-07-30  
Scope: optional account service, authentication UI, and per-account cloud save storage

## Security objective

Guest play and local saves remain fully usable without contacting the account service. Players who opt in may register an email account and synchronize save slots. The system must protect credentials, sessions, personal data, and save integrity without trusting the browser to make authorization or conflict decisions.

## Architecture under review

- The Phaser client continues to own local saves through `SaveService`.
- A separate Node.js account service exposes Better Auth endpoints and authenticated cloud-save endpoints.
- Better Auth provides email/password registration, password hashing, email verification, password reset, signed session cookies, origin checks, and account deletion flows.
- Fastify terminates HTTP, applies request-size limits, security headers, CORS restrictions, and rate limits.
- SQLite is the development database. Production deployments should use PostgreSQL through the same repository interface.
- Cloud saves are stored per authenticated user and slot. Every write uses optimistic concurrency with an expected cloud version.
- Email is delivered by Nodemailer through an operator-supplied SMTP account. Production startup fails if email delivery is not configured.

## Assets

| Asset | Security property |
| --- | --- |
| Password credentials | Never logged or stored in plaintext; resistant to offline guessing |
| Session cookies | Confidential, unforgeable, revocable, scoped to the account service |
| Verification and reset links | Single-purpose, expiring, and unusable after consumption |
| Cloud save payloads | Confidential to the owner, integrity checked, size bounded |
| Save revision history | Cannot be rolled back or overwritten without explicit user choice |
| Email address | Collected only for authentication and recovery; not exposed publicly |
| Account export | Available only to the authenticated owner; excludes secrets and password hashes |
| Account deletion | Requires a fresh authenticated action and deletes dependent cloud data |
| Service availability | Protected from basic brute force, oversized bodies, and abusive request volume |

## Trust boundaries

1. **Browser to account service.** All browser input is untrusted, including timestamps, revisions, checksums, slot IDs, and save contents.
2. **Account service to database.** Queries must be parameterized through established libraries. Migrations define constraints and cascade behavior.
3. **Account service to SMTP.** Verification and reset URLs are sensitive. They must not be logged in production or sent to an untrusted endpoint.
4. **Local save store to cloud sync client.** Local storage may be modified by extensions or developer tools. The server validates structure and computes its own digest.
5. **Deployment proxy to Node.js.** TLS is expected at the reverse proxy. Forwarded headers are trusted only when the proxy is explicitly configured.

## Threats and mitigations

### Spoofing and account takeover

**Threats**

- Credential stuffing or brute-force sign-in attempts.
- Session token theft through script access, insecure transport, or broad cookie scope.
- Email enumeration during registration or password reset.
- Reuse of old sessions after password reset.
- Forged account identifiers in cloud-save requests.

**Mitigations**

- Use Better Auth email/password authentication rather than custom authentication code.
- Require verified email before sign-in and use generic registration/reset responses.
- Use Better Auth's password hashing implementation; no plaintext or reversible password storage.
- Use `HttpOnly`, `Secure` in production, `SameSite=Lax`, host-scoped session cookies.
- Revoke other sessions after password reset and allow session revocation on password change.
- Apply strict per-IP and per-route rate limits to authentication and reset endpoints.
- Resolve the user ID exclusively from the verified server session. Ignore user IDs in request bodies.

### Tampering and cloud-save rollback

**Threats**

- A client alters currency, inventory, revision, or timestamps before upload.
- Two devices overwrite each other.
- A stale browser tab silently overwrites a newer cloud save.
- Replayed upload requests create duplicate versions or rewards.
- A malicious client supplies a fake checksum.

**Mitigations**

- Validate the complete request envelope and a bounded subset of the Emberveil save schema.
- Recompute SHA-256 server-side; never trust the client digest.
- Require `expectedCloudVersion` on every replacement. Database updates use compare-and-swap semantics.
- Return HTTP 409 with local/cloud metadata whenever the expected version differs or the incoming save is older without an explicit `keep-local` decision.
- Store an idempotency key for uploads and return the prior result when a request is retried.
- Keep the previous cloud version as a backup before replacement.
- Cloud saving does not make client-authored gameplay authoritative. Competitive or co-op rewards remain server-owned by the gameplay server.

### Repudiation

**Threats**

- A player claims the service overwrote or deleted a newer save.
- Operators cannot distinguish a normal upload from an explicit conflict override.

**Mitigations**

- Record cloud version, payload revision, save timestamp, server update timestamp, decision type, and request idempotency key.
- Do not log save payloads, passwords, cookies, reset tokens, or verification URLs.
- Account deletion is explicit and confirmed in the client.

### Information disclosure

**Threats**

- Insecure direct object reference exposes another player's save.
- CORS or CSRF mistakes allow another site to read or modify saves.
- Account export leaks session tokens or password hashes.
- Error messages disclose whether an email is registered.
- Logs capture personal data or authentication secrets.

**Mitigations**

- All save queries include the authenticated `userId`; slot IDs are allowlisted.
- Restrict CORS to configured origins and send credentials only to those origins.
- Better Auth validates trusted origins and uses signed cookies. Custom mutating routes additionally require a CSRF header token bound to the session.
- Personal-data export contains only account profile fields and cloud saves. It excludes sessions, password/account credential fields, verification tokens, IP addresses, and user agents.
- Use generic external errors and structured internal logs with redaction.
- Collect only email, an internal display label, verification status, timestamps, and save data.

### Denial of service

**Threats**

- Oversized save uploads exhaust memory or database capacity.
- Repeated registration, reset, export, or sync calls consume service resources.
- Crafted JSON causes excessive parser work.

**Mitigations**

- Set Fastify body limits and a stricter 512 KiB cloud-save payload cap.
- Limit cloud saves to four known slot IDs and one current plus one backup version per slot.
- Apply global and route-specific rate limits.
- Reject malformed JSON and schema violations before database work.
- Set database busy timeouts and use short transactions.

### Elevation of privilege

**Threats**

- A guest calls authenticated endpoints.
- A user changes another user's saves or deletion state.
- A CSRF request deletes an account or replaces a cloud save.
- Untrusted redirect URLs send verification/reset tokens to an attacker.

**Mitigations**

- Require a valid Better Auth session on every cloud, export, and deletion endpoint.
- Never accept role, user ID, ownership, or email-verification state from the client.
- Require CSRF protection and same-origin checks for custom state-changing routes.
- Allow only configured application origins for callback and redirect URLs.
- Account deletion requires Better Auth's password/fresh-session/email-verification safeguards and cascades owned save rows.

## Save conflict policy

A server write is accepted only when one of these conditions is true:

1. The slot does not yet exist and the request declares `expectedCloudVersion: null`.
2. The incoming save is newer and `expectedCloudVersion` exactly matches the server version.
3. The player explicitly selects **Keep local**, and the request includes the exact currently displayed cloud version.

A newer cloud save is never overwritten because of background synchronization. When versions diverge, the UI displays both local and cloud timestamps, revisions, map locations, and playtimes, then requires the player to choose **Keep local**, **Use cloud**, or **Cancel**.

## Safe failure behavior

- If the account service is unavailable, the game remains in guest/local mode and never blocks local saving.
- If session validation fails, cloud controls return to signed-out state without deleting local data.
- If upload validation fails, the local save remains untouched.
- If download/import validation fails, the current local slot remains untouched.
- If a database migration fails, the account service does not start.
- If production SMTP configuration is missing, registration is disabled by failing startup rather than creating unverifiable accounts.

## Residual risks

- A compromised browser or extension can read local saves and act through an active session.
- Email account compromise can enable password reset.
- Operators with database access can read cloud save payloads unless deployment-level encryption is added.
- Client-authored single-player saves can be edited by the player. Cloud storage protects ownership and conflicts, not single-player anti-cheat.
- Availability still depends on the deployment's TLS proxy, database backups, SMTP provider, and monitoring.

## Security verification checklist

- Authentication library and dependencies pinned and reviewed for advisories.
- Production uses HTTPS and secure cookies.
- Trusted origins contain only deployed Emberveil origins.
- SMTP credentials are supplied through secrets, never committed.
- Database migrations run before traffic is accepted.
- Registration, sign-in, reset, cloud writes, export, and deletion have rate-limit tests.
- Cross-user access tests return 404/403 without revealing resource existence.
- Conflict tests prove that stale writes return 409 and do not mutate cloud data.
- Export tests prove credential/session tables are excluded.
- Deletion tests prove cloud current/backup/idempotency rows are removed.

## References

- Better Auth email/password, verification, reset, session, cookie, security, and account deletion documentation.
- Fastify and official Fastify plugins for CORS, rate limiting, cookies, and security headers.
- OWASP Authentication, Password Storage, Session Management, CSRF Prevention, and REST Security cheat sheets.

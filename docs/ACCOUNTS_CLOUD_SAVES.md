# Optional accounts and cloud saves

Emberveil remains a local-first game. Accounts are optional, guest play is always available, and the account service never blocks local saving or single-player startup.

The security assumptions and abuse cases were documented before implementation in [`ACCOUNT_CLOUD_SAVE_THREAT_MODEL.md`](ACCOUNT_CLOUD_SAVE_THREAT_MODEL.md).

## Player flow

Choose **Account / Cloud** on the title screen.

Without an account, the screen explains that all local slots continue to work and offers registration, sign-in, password reset, account-server configuration, or an immediate return to guest play.

After sign-in, each of the four local slots is shown next to its cloud counterpart:

- local save timestamp, revision, map, and playtime
- cloud save timestamp, revision, map, playtime, and cloud version
- whether the slot is local-only, cloud-only, local newer, cloud newer, or matched
- explicit **Upload local** and **Use cloud** actions

If a cloud save is newer, or if another device changes the cloud version after the screen loads, Emberveil shows a three-way choice: **Keep local**, **Use cloud**, or **Cancel**. No background operation silently replaces either copy.

## Authentication

The optional account service uses Better Auth for email/password registration, verification links, password reset, password hashing, session creation, origin validation, and account deletion. Emberveil does not implement password hashing or token cryptography itself.

Configuration:

- email verification is required before sign-in
- registration does not automatically create a session
- passwords must contain 12–128 characters
- password reset tokens expire after one hour
- password reset revokes existing sessions
- sessions use database-backed, HTTP-only cookies
- production cookies are secure and the public service URL must use HTTPS
- session freshness is limited to ten minutes for sensitive account actions
- Better Auth and Fastify both apply route-specific rate limits

Only an email address is requested from the player. Better Auth requires a name field, so the client supplies the generic label `Emberveil Player` rather than collecting a real name, avatar, birthday, location, or profile.

## Email delivery

The service uses Nodemailer with operator-provided SMTP settings. Production startup fails when SMTP delivery is missing. Development mode may write the verification/reset link to the development log so local testing does not require an email provider.

Authentication emails include account verification, password reset, and account-deletion verification when the password/fresh-session path is unavailable.

Do not commit SMTP credentials or authentication secrets. Use deployment secrets or a dedicated secret manager.

## Sessions, CORS, and CSRF

Better Auth's own routes retain its origin and CSRF checks. Custom cloud-save mutation routes add:

- a strict CORS allowlist
- credentialed requests only from configured game origins
- `SameSite=Strict`, signed, HTTP-only CSRF secret cookies
- `@fastify/csrf-protection` tokens sent in `X-CSRF-Token`
- user-bound tokens using the authenticated session ID and a server-only HMAC key
- Fetch Metadata and explicit `Origin` checks
- security headers from `@fastify/helmet`

The account service should normally be reverse-proxied beneath the same site as the game. That keeps session cookies first-party on browsers with strict cross-site cookie controls.

## Database and migrations

Development uses SQLite through `better-sqlite3`. Better Auth's schema is migrated first with its supported programmatic migration API. Emberveil then runs ordered SQL files and records each applied migration in `emberveil_app_migration`.

The first Emberveil migration creates current cloud saves, previous cloud-save backups, and idempotency results for retried uploads. All tables reference the Better Auth user record with `ON DELETE CASCADE`.

## Cloud-save write protocol

The browser sends a known slot ID, the complete current save, a UUID idempotency key, the exact displayed cloud version (or `null`), and either `sync` or the explicit conflict decision `keep-local`.

The server authenticates the session, derives the user ID server-side, validates the request and 512 KiB size limit, computes its own SHA-256 payload digest, checks idempotency, starts an immediate transaction, compares versions, rejects stale writes, rotates the prior copy to backup, performs a compare-and-swap update, and records the result.

The client never supplies an account ID or trusted checksum. Cloud storage preserves player-owned single-player saves; it is not an authority for online co-op rewards.

## Conflict rules

A write is accepted only when the cloud slot is empty and expected empty, when the exact current cloud version is expected and the local copy is newer, or when the player explicitly selects **Keep local** against the exact current cloud version.

A 409 response includes safe cloud metadata. The client refreshes the comparison and requires another choice. A race cannot silently replace a newer save.

Choosing **Use cloud** validates the downloaded save with the durable `SaveService`. The current local primary becomes the local backup before the cloud copy is installed. A malformed download leaves the local slot untouched.

## Personal data

**Export personal data** downloads internal account ID, email and verification status, the generic display label, account timestamps, and the player's cloud saves. It excludes password hashes, credential records, sessions, reset/verification tokens, IP addresses, and user agents.

**Delete account** requires explicit confirmation and the current password. Better Auth validates deletion, then foreign keys remove current saves, cloud backups, and idempotency records. Local saves remain on the device.

## Automated verification

The tests cover slot/save validation, first upload, normal update, stale expected versions, rejection of older automatic uploads, explicit keep-local override, idempotent retries, cross-user isolation, cloud backup rotation, account-deletion cascades, and personal-data export exclusions.

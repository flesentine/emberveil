# Emberveil optional accounts and cloud saves

This is the deployable Node.js service used by Emberveil's optional account and cloud-save integration. Guest play and browser-local saves continue to work without this service.

Read the threat model first: [`../docs/ACCOUNT_CLOUD_SAVE_THREAT_MODEL.md`](../docs/ACCOUNT_CLOUD_SAVE_THREAT_MODEL.md).

## Security design

- Better Auth owns registration, password hashing, email verification, password reset, and database-backed sessions.
- Fastify applies body limits, CORS restrictions, security headers, route/global rate limits, and strict request parsing.
- Custom cloud-save writes require a signed, session-bound CSRF token and a trusted browser origin.
- The service derives the owner from the authenticated session. User IDs in client payloads are never accepted.
- Cloud writes use optimistic concurrency and an exact `expectedCloudVersion` compare-and-swap.
- Stale or divergent writes return HTTP 409. A newer cloud save is never silently replaced.
- Every accepted upload rotates the prior cloud copy to a backup and records an idempotency key.
- Personal-data export excludes sessions, password/account credential records, reset tokens, and verification records.
- Account deletion uses Better Auth and database foreign-key cascades to remove cloud-save data.

## Run locally

```bash
cp .env.example .env
# Set three independent 32+ character secrets in .env.
npm install
npm run migrate
npm start
```

The default account service address is `http://localhost:8082`. The game remains usable when the service is offline.

In development, verification and reset links are written to the server log. Production startup requires SMTP configuration and an HTTPS public URL.

## Cloud conflict contract

Each upload includes:

- one of four allow-listed slot IDs
- the complete validated save payload
- `expectedCloudVersion`
- `decision: "sync"` or an explicit `decision: "keep-local"`
- a UUID idempotency key

The service accepts a normal sync only when the cloud version exactly matches what the player saw and the local save is newer. Equal metadata with different contents is treated as a conflict. An older local save can replace cloud only after the player explicitly chooses **Keep local** against the exact current cloud version.

The Emberveil client comparison screen shows local and cloud timestamps, revisions, map locations, and playtime. Choosing **Use cloud** preserves the replaced local copy as a backup.

## Tests

```bash
npm test
```

The executable tests cover schema validation, initial uploads, stale writes, divergent saves, explicit conflict overrides, per-user isolation, idempotent retries, backup rotation, personal-data export, and account-deletion cascades.

# Deployment

## Static game client

The recommended static host is Netlify. The included `netlify.toml` builds the Vite project, publishes `dist/`, serves SPA fallbacks, applies immutable caching to hashed assets, disables long-lived caching for HTML/version files, and adds security headers.

Required build command:

```bash
npm install
npm run check:release
```

Publish directory: `dist`

Production must use HTTPS. Configure:

```text
VITE_RELEASE_CHANNEL=public-preview
VITE_BUILD_ID=<CI commit or release identifier>
VITE_COOP_WS_URL=wss://<co-op-host>/ws
VITE_ACCOUNT_API_URL=https://<account-host>
VITE_DEBUG_MODE=false
VITE_TEST_MODE=false
```

Do not place secrets in `VITE_*` variables; Vite embeds them in the public client bundle.

## Security headers

The static configuration applies a practical CSP, HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, and cross-origin opener policy. Update `connect-src` only for the exact production HTTPS/WSS service origins.

## Multiplayer server

Deploy the dedicated Node.js WebSocket room server separately using `deploy/coop/Dockerfile` or an equivalent managed service. Terminate TLS at the host/reverse proxy and expose only WSS publicly. Configure origin allowlists, connection limits, packet/body limits, and rate limits. Private invite-code rooms do not require accounts.

## Account and cloud-save service

Deploy the Fastify/Better Auth service separately using `deploy/accounts/Dockerfile`. Production startup requires HTTPS, a strong Better Auth secret, persistent database storage, an exact client-origin allowlist, and working SMTP for verification/reset email. Run ordered database migrations before serving traffic.

## Cache busting and offline updates

Vite emits hashed JS/CSS assets. The finalizer writes `version.json`, `release-manifest.json`, and a versioned service-worker cache. HTML and version metadata use revalidation; hashed assets use immutable caching. A new release uses a new build ID/cache name and removes old Emberveil caches during service-worker activation.

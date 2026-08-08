# Cloudflare API proxy

The Worker in `snippet.js` proxies browser requests to `api.folo.is` and applies a strict CORS allowlist. It replaces the previous reflective `Access-Control-Allow-Origin` behavior.

## Security model

- Only explicitly trusted browser origins receive CORS headers.
- `Access-Control-Allow-Credentials` is returned only for trusted origins.
- Untrusted browser requests with an `Origin` header receive `403 Forbidden`.
- Requests without an `Origin` header (server-to-server tools, health checks) are proxied without CORS headers.
- Preflight (`OPTIONS`) and normal proxied responses use the same origin policy.
- Allowed methods and headers are limited to the application's real needs; requested preflight headers are validated against that list.
- `Vary: Origin` is set whenever CORS headers are returned.

## Default trusted origins

These origins are always allowed:

- `https://app.folo.is`
- `https://folo.is`
- `https://dev.folo.is`
- `https://staging.folo.is`
- `http://localhost:2233`
- `http://127.0.0.1:2233`
- `http://localhost:2234`
- `http://127.0.0.1:2234`

Arbitrary localhost ports are not allowed unless explicitly configured.

## Configure preview or custom origins

Set `FOLO_CORS_ALLOWED_ORIGINS` in the Worker environment (`cloudflare/api/wrangler.toml` `[vars]` section or the Cloudflare dashboard):

```toml
[vars]
FOLO_CORS_ALLOWED_ORIGINS = "https://folo.1094712.xyz,https://my-preview.pages.dev"
```

Values are comma-separated and must be exact origins (`scheme://host[:port]`). Suffix or substring matching is not used.

## Upstream Origin header

The proxy rewrites the upstream request `Origin` header to `https://folo.is` before forwarding to `api.folo.is`. This matches the upstream API's expected browser origin and is independent of the browser's actual page origin. CORS headers on the response still reflect the trusted browser origin that initiated the request.

## Deploy

```bash
cd cloudflare/api
pnpm install
pnpm run deploy
```

## Test

```bash
cd cloudflare/api
pnpm test
```

## Manual verification

Trusted origin:

```bash
curl -i -H "Origin: https://app.folo.is" https://<proxy-host>/status
```

Untrusted origin:

```bash
curl -i -H "Origin: https://evil.example.test" https://<proxy-host>/status
```

Preflight:

```bash
curl -i -X OPTIONS \
  -H "Origin: https://app.folo.is" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: authorization, content-type" \
  https://<proxy-host>/status
```

Do not log authentication tokens, cookies, or sensitive upstream response headers during verification.

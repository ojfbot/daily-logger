# Private HTTPS ingress preparation

The dedicated Caddy proxy terminates HTTPS and forwards the original Host,
including its external port, to the owner API. It publishes one explicit private
IPv4 TCP binding. The API, worker and PostgreSQL publish no host ports. The
existing base configuration continues to use an API loopback listener.

This is source preparation and CI qualification. Real client trust, leaf
issuance/renewal, NAS listener/firewall reconciliation, DNS, remote WireGuard,
public-reachability checks and actual owner GitHub login remain live work.

## Prepare private configuration

Write an operator-owned input JSON outside Git. The values below describe a
local test; use the owner-reviewed NAS address and approved source networks for
the real private installation.

```json
{
  "origin": "https://dailylogger.test:8443",
  "bindIpv4": "127.0.0.1",
  "allowedPeerCidrs": ["127.0.0.1/32"]
}
```

```sh
pnpm service:ingress:prepare /private/path/ingress-input.json /private/path/new-ingress
```

The renderer rejects public/wildcard binds, non-private or noncanonical source
CIDRs, non-origin URLs, unknown fields and existing output destinations. It
writes a Caddyfile and a Compose JSON overlay outside Git. No key, certificate,
credential, DNS record, trust setting or running service is created.

Set `DAILYLOGGER_INGRESS_CONFIG_DIR` to that directory as it exists on the target
host and `DAILYLOGGER_TLS_DIRECTORY` to the protected parent certificate directory
there. Keep the existing application environment values private. Compose resolves
these host paths; rendering does not assume the NAS paths exist on the preparing
Mac. Validate the merged configuration before using the approved release path:

```sh
docker compose -f apps/service/runtime/compose.yaml \
  -f /private/path/new-ingress/compose.json config --quiet
```

The overlay explicitly enables `DAILYLOGGER_HTTP_HOST=0.0.0.0` in the API's
container and attaches Caddy to the ordinary API bridge. That bridge supplies
incoming TCP's return route and the API's GitHub HTTPS egress. The proxy never
joins the PostgreSQL network and receives no database/OAuth credentials. The
API socket remains reachable by trusted application DB/worker peers; this is
not a proxy-only interface bind. No host networking, static-IP allocation or
Docker socket is used. The API's full owner/session/Origin/CSRF checks remain.

Independent namespaces let proxy replacement and certificate loading leave API
state and container identity intact. API replacement reconnects through service
DNS while the proxy stays running. Namespace sharing was rejected because it
coupled replacements and required removing inherited Compose network settings.

## TLS and request boundaries

The PKI owner supplies a protected, versioned directory containing:

```text
current/fullchain.pem
current/privkey.pem
current/issuance.json
```

Only the proxy mounts the protected parent directory, read-only. The signer
validates a complete generation and switches `current` before restarting the
proxy. Parent mounting makes generation changes visible without stale file
inode mounts. No CA signing key belongs on the proxy or API. Issuer ownership,
client trust and certificate renewal are separate from this file consumer.
Initial supervised replacement uses proxy restart; the admin API is disabled.
Unattended renewal readiness requires its own tested bounded activation method.

Caddy authorizes immediate socket peers, without trusting forwarding headers.
Use only approved LAN and WireGuard source ranges. A NAS path that collapses
allowed and denied clients into the same bridge address fails qualification;
do not add a broad Docker range to bypass that failure. The separately owned
host-firewall design must reconcile source policy and both address families.

The proxy keeps the original authority and disables access/request error logs
that could capture OAuth callback codes, state or cookies. Errors are closed
JSON with no-store; upstream failures retain exact-key reconciliation semantics.
Automatic HTTPS issuance, HTTP redirects, HTTP/3/UDP, admin publication and
load-balancer retries are disabled. CI proves single forwarding for the current
JSON mutation when its upstream drops the accepted request. Changes to request
body or replay semantics need transport requalification. The leaf files supply
trusted TLS without any certificate-verification bypass.

## Qualification

```sh
pnpm type-check:service
pnpm test:service:runtime
pnpm service:ingress:smoke dailylogger-runtime:local
```

The CI harness uses an ephemeral CA, actual production API/worker image and
fixed/generated fixture credentials. It verifies strict TLS/name rejection,
the actual published TCP path, distinct peer allow/deny and spoofed headers,
original Host/port, callback/cookie attributes, direct backend separation from
another Docker network, log canaries, independent container replacement and
leaf replacement while session/command/checkpoint identity persists. Its seeded
test session is private harness data, not a production authentication flag or
real GitHub login receipt. No image is published or NAS service activated.

The implementation follows [Caddy proxy headers](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy#headers),
[peer matching](https://caddyserver.com/docs/caddyfile/matchers#remote-ip),
and [global logging/admin controls](https://caddyserver.com/docs/caddyfile/options).

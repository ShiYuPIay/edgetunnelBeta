# **shiplay – VLESS over WebSocket (Cloudflare) Deployment Guide**

[[中文](README.md) | [English](README_EN.md)]

This document provides an English overview of **shiplay**, a VLESS‑over‑WebSocket proxy designed for Cloudflare Workers or Pages. It is heavily based on the open‑source [edgetunnel](https://github.com/zizifn/edgetunnel) project and adds a WebUI, dynamic configuration stored in KV, automatic rule set updates, proxy load balancing and IP purity checks.

## Overview

shiplay accepts VLESS clients over WebSocket + TLS, forwards their traffic to upstream proxies and exposes several management APIs. The Worker stores its configuration (UUID, WS path, node name, ports, upstream IPs, etc.) in a Cloudflare KV namespace. Users can change these parameters via a built‑in dashboard at `/admin` without redeploying. The Worker also generates subscription files for different clients (Base64, Clash, Sing‑box, Surge, Quantumult X).

### Key components

- **WebSockets**: Cloudflare Workers can upgrade HTTP requests to WebSocket connections【806802050595069†L30-L40】, which makes real‑time proxying possible.
- **KV Storage**: All configuration is persisted to KV using the `put()` method【388052156445749†L110-L117】 so that changes take effect on the next request.
 - **WebUI**: The admin panel at `/admin` prompts for a password (set via the `ADMIN` environment variable). Once logged in you can edit and save settings, copy a single node link or the full subscription URL, generate “preferred” links from your best IP list, produce subscription files in multiple formats, update rule sets, perform IP checks and explore an advanced section showing the raw configuration and placeholders for future features (ECH, CDN tuning, subscription conversion, notifications and logs).
- **Rule sets**: shiplay fetches rule lists from the `blackmatrix7/ios_rule_script` repository daily via a scheduled event.
- **IP purity checking**: The `ip-api.com` JSON API returns geolocation and proxy status【762169240514008†L48-L77】; the Scamalytics site assigns each IP a fraud score from 0 (low risk) to 100 (high risk)【404162411908998†L120-L125】.
- **Proxy health**: Optional cron jobs can ping upstream IPs and remove unreachable ones from the configuration.

## Deployment steps (summary)

1. **Create a KV namespace** in the Cloudflare dashboard and record its ID.
2. **Configure `wrangler.toml`**: set the `kv_namespaces` binding to your namespace ID. Define an `ADMIN` password locally via `wrangler.toml` or use `wrangler secret put ADMIN` so that deployments will have a default admin password.
3. **Publish the Worker** with `wrangler publish --name shiplay`. Wrangler uploads `_worker.js` and binds the KV namespace.
4. **Set the `ADMIN` variable** in the Cloudflare dashboard: go to your Worker’s **Settings → Variables**, click **Add variable**, name it `ADMIN` and provide a strong password. Without this variable the dashboard will refuse access and display instructions.
5. **Login to `/admin`** using the password you set. The dashboard stores an `auth` cookie (SHA‑256 of password + User‑Agent) for seven days to avoid re‑entering your credentials.
6. **Edit the configuration**: fill in your UUID, WebSocket path, node name, upstream IPs, best IP list and ports, then click “Save”. Changes are persisted in KV and take effect immediately.
7. **Copy node and subscription links**: in the “Get node link” section the dashboard shows a single VLESS URL (using the first IP/port) and the subscription endpoint. Use the copy buttons to share them quickly with your devices.
8. **Generate preferred links**: if you have specified a list of `bestIPs`, the dashboard will render each IP/port combination as its own link with a copy button for granular selection.
9. **Generate subscriptions**: click the appropriate button to produce Base64, Clash YAML, Sing‑box JSON, Surge or Quantumult X formats. The output appears in a text box for copying into your client. You can also fetch these directly via `/api/subscribe?type=…`.
10. **Update rule sets**: click the “Update rules” button or rely on the daily scheduled task. The Worker stores the list URLs in KV and inserts them into the Clash subscription.
11. **Check IP purity**: type an IP into the IP check box; the result shows geo info and the fraud score (0–100). Note that ip‑api.com has a free limit of 45 requests/minute【762169240514008†L139-L145】 and Scamalytics scores are scraped from public data.
12. **Optional health checks**: enable `enableHealthCheck` in the configuration to let the Worker periodically ping your upstream IPs and drop those that fail.

## Configuration notes

- **UUID**: You may let shiplay generate a UUID on first run or set your own. It should match what your VLESS clients use.
- **WebSocket path**: Set to `/ws` by default; you may change this but ensure your client configuration matches.
- **Proxy IPs**: Provide a comma‑separated list of upstream servers or CDN IPs. The Worker picks one at random for each connection.
- **Ports**: Provide comma‑separated ports (e.g. `443,2053,2083`); subscriptions will include every IP/port combination.
- **Node name**: A friendly label displayed in client apps; emojis and non‑ASCII characters are supported.
- **Fake site**: Unmatched requests are proxied to this URL (default: `https://www.microsoft.com`), providing cover traffic.

## Limits and security

Cloudflare’s free Worker tier allows ~100k requests/month and 100 ms CPU per request. KV operations count separately but shiplay writes to KV only when saving configuration or updating rules. The ip-api.com endpoint does not support HTTPS for the free tier and is limited to 45 requests/minute【762169240514008†L139-L145】. Scamalytics scoring is scraped from public HTML and may be inaccurate【404162411908998†L120-L125】; use it only as a guideline.

Always choose a strong `ADMIN` password. The dashboard uses SHA‑256 plus the User‑Agent header for hashing and stores the digest in a cookie. To revoke access, change the `ADMIN` value and instruct users to log in again.

## Referenced open‑source projects

shiplay builds on the shoulders of several popular open‑source projects. These repositories illustrate best practices for proxying over Cloudflare, multi‑protocol support, NAT64, rule maintenance and IP testing. The high star counts reflect their popularity and reliability:

| Project | GitHub URL | Usage & description | Stars |
|---|---|---|---|
| **cmliu/edgetunnel** | <https://github.com/cmliu/edgetunnel> | Core architectural reference for VLESS/Trojan over Cloudflare Workers, including a management panel. The repository has more than 27k stars【577833122400292†L150-L160】. | ~27k |
| **eooce/Cloudflare‑proxy** | <https://github.com/eooce/Cloudflare-proxy> | Demonstrates deploying VLESS/Trojan/Shadowsocks on Cloudflare; we refer to it for multi‑protocol support. It has around 2.3k stars【994423360103766†L151-L159】. | ~2.3k |
| **yonggekkk/Cloudflare‑vless‑trojan** | <https://github.com/yonggekkk/Cloudflare-vless-trojan> | Implements VLESS-ws and Trojan-ws with NAT64 options; we follow its NAT64 configuration example. This repository has ~13.7k stars【607968020895763†L150-L156】. | ~13.7k |
| **blackmatrix7/ios_rule_script** | <https://github.com/blackmatrix7/ios_rule_script> | Provides lists for unlocking AI services, streaming, shopping and Google; shiplay fetches these lists via Cron【557094666453825†L140-L147】. | ~25.2k |
| **Loyalsoldier/clash‑rules** | <https://github.com/Loyalsoldier/clash-rules> | Offers Clash Premium rule sets used for traffic routing【7515614886908†L138-L146】. | ~25.2k |
| **ACL4SSR/ACL4SSR** | <https://github.com/ACL4SSR/ACL4SSR> | Supplies ACL and SSR/Clash rules for fine‑grained traffic splitting【8636220021196†L138-L143】. | ~5.9k |
| **XIU2/CloudflareSpeedTest** | <https://github.com/XIU2/CloudflareSpeedTest> | A tool to test and select the best Cloudflare IPs; we recommend using it to build your preferred IP list. It has about 25k stars【347904265856978†L114-L125】. | ~25k |


## Q&A

- **Why do I get 1101 errors?**
  Workers throw 1101 when an unhandled exception occurs or CPU time is exceeded. Check your upstream IP/port, ensure the UUID is correct and examine the Worker logs.

- **Can I deploy on Pages instead of Workers?**
  Yes; you can use Cloudflare Pages with Functions. Commit `_worker.js` and `wrangler.toml` to GitHub, configure Pages to use Wrangler and set the KV binding.

- **Does shiplay support gRPC?**
  No. This implementation only supports WebSocket transport. gRPC/H2 would require a completely different handshake.

## Credits

This project would not be possible without the efforts of the open‑source community. In particular, we thank:

- **edgetunnel** by cmliu/zizifn for the core architecture and inspiration.
- **Cloudflare‑proxy** and **Cloudflare‑vless‑trojan** for multi‑protocol and NAT64 references.
- **blackmatrix7/ios_rule_script**, **Loyalsoldier/clash‑rules** and **ACL4SSR** for providing up‑to‑date rule sets for AI, streaming, shopping and traffic splitting.
- **XIU2/CloudflareSpeedTest** for helping users discover optimal Cloudflare IPs.
- **ip‑api.com** and **Scamalytics** for free geolocation and fraud score services.

For detailed Chinese instructions, including a step‑by‑step guide and FAQs, please see [README.md](README.md).
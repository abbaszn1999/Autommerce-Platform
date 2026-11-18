# Meta Ads: connection plan (two stages)

Written: November 18, 2026.
Related: the App Review roadmap in the website repo, `platform_website/website-autommerce/documentation/meta-app-review-roadmap.md` (this plan is **phase 7** there).

## Why two stages

Meta must approve the app "Autommerce platform" (App ID `1163327572927496`) before outside clients can connect. Approval needs a screencast of **our app's real screens** using every requested permission; videos of Postman or Graph API Explorer are rejected.

The Meta Ads tab already exists with full UI, but it runs on demo data and a simulated agent (`src/lib/meta-ads/mock-data.ts`, `src/lib/meta-ads/agent-sim.ts`). Wiring every view to live data before approval is the expensive part, so it is split:

- **Stage A (now):** the smallest real build that shows every permission in the screencast. Useful on its own: while the app is unpublished it already works for admins, developers and testers of the app.
- **Stage B (after approval):** the full Meta Ads tab on live data.

Nothing in stage A is thrown away in stage B: B builds on the same connection, token storage and agent.

## Decisions

| Decision | Choice | Reason |
|---|---|---|
| How the agent reaches Meta | **Meta's official Ads MCP server** (`mcp.facebook.com/ads`) with the client's token | Official, maintained by Meta, no per-action API code on our side |
| Login | **Facebook Login for Business** with our own app | Consent screen shows "Autommerce platform"; the client picks which business, ad accounts, Pages and catalogs to share |
| Token storage | Our database, encrypted with `src/lib/integrations/crypto.ts` (`access_token` is already a secret key there) | No third party in between; same encryption as other integrations |
| Permissions requested | `ads_management`, `ads_read`, `ads_mcp_management`, `business_management`, `catalog_management`, `pages_show_list`, `pages_read_engagement`, `public_profile` | Matches the cleaned App Review list |

## To verify first (before writing code)

Public information on the Ads MCP server is mostly secondary coverage. Read Meta's own docs and confirm:

1. The server URL and how a third-party app passes a client's user token (Bearer header assumed).
2. The required scopes (reported: `ads_mcp_management` plus `ads_read` or `ads_management`).
3. Which token types work (reported: some system-user tokens are rejected). We use the client's own user token from Facebook Login for Business.
4. The full tool list: what it covers for ads, insights, catalogs, Pages and businesses. Anything not covered is done with a few direct Graph API calls.
5. Token lifetime: Facebook Login for Business user tokens are long-lived (about 60 days) or don't expire, depending on the configuration; how and when the client must reconnect.
6. Rate limits under the Limited Marketing API tier.

Write the answers into this file under "Verified facts" before stage A starts.

## Verified facts (checked November 18, 2026)

Sources: Meta's official docs (Ads MCP Server overview, get started, all 7 tool-category pages, rules best practices; Facebook Login for Business; manual login flow; permissions reference) and a live request to the server itself.

### 1. Server and transport
- URL: `https://mcp.facebook.com/ads` (Meta-hosted).
- Transport: MCP over HTTP POST with JSON-RPC (Meta's own setup uses `--transport http`).
- **Live check:** a request without a token returns `401` with `WWW-Authenticate: Bearer resource_metadata="https://mcp.facebook.com/.well-known/oauth-protected-resource/ads"`. That metadata says: authorization server `https://www.facebook.com/ads`, `bearer_methods_supported: ["header"]`.

### 2. How our app authenticates
Meta documents three methods: OAuth inside an MCP client, a **user access token from "your own OAuth flow"**, or a system user token. For a programmatic call: header `Authorization: Bearer <ACCESS_TOKEN>`.
**Our method:** Facebook Login for Business on our site → server-side code exchange (`GET https://graph.facebook.com/v27.0/oauth/access_token` with `client_id`, `redirect_uri`, `client_secret`, `code`; server-to-server only, it uses the app secret) → we store the client's token encrypted → the agent sends it as the Bearer header.
App setup Meta asks for: the **"Create & manage ads with ads MCP server"** use case (already added) and the redirect URL set in Facebook Login for Business settings.

### 3. Permissions
- Minimum: `ads_mcp_management` **plus** `ads_read` or `ads_management`.
- More tools unlock with: `ads_management`, `catalog_management`, `business_management`, `pages_show_list`, `instagram_basic`.
- The server's own list of scopes it understands: `ads_management ads_read catalog_management business_management pages_show_list pages_manage_ads facebook_branded_content_ads_brand instagram_basic instagram_branded_content_ads_brand ads_mcp_management`.
- `pages_read_engagement` is **not** an MCP scope, so Page posts come from a direct Graph API call (see 5).
- Permission reference for `ads_mcp_management`: "allows your app to access the Meta ads Model Context Protocol (MCP) server and enable AI agents to interact with Meta Ads on behalf of advertisers". Allowed usage: create/edit/manage campaigns, retrieve insights and reports, manage catalogs and other business assets. No dependencies. App Review asks for a use-case description and a screencast.

### 4. Token types
- Accepted: **user access tokens**; **Employee-role** system user tokens. **Admin-role system user tokens are rejected.**
- Facebook Login for Business offers two token types:
  - **User access token**: our choice. Short-lived from login; we exchange it for a long-lived token (about 60 days). The client must **reconnect about every 60 days**, so stage A shows an expiry date and a "Reconnect" button, and warns a week before.
  - **Business integration system user token**: never expires by default, assets chosen by the client, but documented as "Tech Providers only", and Meta doesn't say whether it is Admin or Employee role (Admin is rejected by the MCP). **Not used in stage A**; revisit in stage B.
- Not documented: lifetime rules specific to MCP. The probe (below) confirms in practice.

### 5. Tools (about 88, in 7 categories)
| Category | Count | Read | Write |
|---|---|---|---|
| Ad creation and management | 28 | ad accounts, Pages (by ad account, business or user), campaigns/ad sets/ads search with metrics, creatives, images, videos, **ad previews**, Ad Library search, Instagram accounts and media, custom audiences | create campaign / ad set / ad (**created paused**), update entity, **activate entity (starts spending)**, create creative, boost IG post, create/update/delete custom audiences, upload hashed customer lists |
| Reporting | 7 | entity metrics, opportunity score, advertiser context, anomaly signal, auction ranking benchmarks, industry benchmark, performance trend | none |
| Catalogs | 31 | catalogs, DPA-eligible catalogs, diagnostics, dynamic ads health, data sources, products, product sets, feeds, upload sessions, feed rules, event sources | create/update catalog, create/update/delete product, product sets, feeds, feed rules, connect/disconnect event source |
| Signals and datasets | 13 | datasets (pixels), details, stats, quality (EMQ), pixel events and parameters, custom conversions | create/update/delete pixel events and parameters |
| Activity logs | 1 | `ads_account_get_activity_logs` | none |
| A/B tests and lift studies | 7 | list tests, eligibility, get A/B test, get lift study | create/update A/B test, create lift study |
| Help and troubleshooting | 2 | `ads_get_errors` (delivery-blocking errors), `ads_get_help_article` | none |

**Not covered by the MCP → direct Graph API calls in stage A:**
- List the client's **business portfolios** (`GET /me/businesses`, `business_management`).
- List **Page posts** (`GET /{page-id}/posts` with the Page token, `pages_read_engagement`).
- Revoke access on Disconnect (`DELETE /me/permissions`).

### 6. Limits, review, safety
- **Rate limits:** no numbers published. Meta says to watch the `x-business-use-case-usage` header and back off. Our app is on the Limited Marketing API tier until the upgrade (roadmap phase 10).
- **App Review:** Facebook Login for Business docs: "To serve businesses that you do not own or manage, your app must be approved for Advanced Access via Meta's App Review", plus Ongoing Review afterwards. Before approval, it works only for people with a role on our app (not documented specifically for the MCP; the probe confirms).
- **Safety:** Meta's write tools create things **paused**, but `ads_activate_entity` starts spending and nothing on Meta's side forces a human approval. **Our server must hold every write tool until the client clicks Approve** (A2.4). Meta's "ads MCP rules" (deny an agent action per ad account or catalog, e.g. budget limits) are in limited availability, so they are an optional extra, not our safety layer.
- **Data note:** `ads_update_custom_audience_users` uploads hashed customer lists. Stage A does not offer it; the Privacy Policy doesn't cover customer-list uploads yet.

### 7. Ads CLI
A separate Meta product (`meta ads <resource> <action>`) using system user tokens. Not needed for our setup.

### 8. Policy check: data shared between the Google and Meta agents (Developer Policy §10.7)
Checked `src/lib/ads-shared/business-store.ts` (commit `81bd68d`). Both agents share:
- the **business profile** (the business's own description): **fine**;
- the **agent memories**, free-text facts either agent learns, tagged with `platform`. Both agent runners pass **all** memories to the agent (`src/lib/google-ads/agent-runner.ts`, `src/lib/meta-ads/agent-runner.ts`). **Risk:** a memory learned from Meta data (for example "Meta CPA is $12", audience results) would reach the Google Ads agent. §10.7 forbids using an advertiser's Meta campaign data on other platforms.
- **Fix for stage A:** the Google Ads agent receives only memories not tagged `meta`, and the Meta agent is told not to save Meta performance numbers into shared memories. Business facts the user types in stay shared.

### 9. Probe result (run November 18, 2026)
`scripts/meta-mcp-probe.mjs`, run with a Graph API Explorer token of our app (unpublished, development mode) including `ads_mcp_management`. Raw output: `meta-ads/mcp-probe-result.json` (git-ignored, no token inside).

- **It works in development mode** with our own app's user token: `initialize` 200, server "Meta Ads MCP Server" 1.0.0, protocol `2025-06-18`.
- Transport: replies come as **SSE** (`text/event-stream`), and the server issues an **`Mcp-Session-Id`** that must be sent on later requests. A standard MCP client (streamable HTTP) handles both.
- **107 tools** live (more than the 88 in the docs). Every tool carries MCP annotations: `readOnlyHint` (read vs write) and `destructiveHint` (irreversible). **Our approval gate can be automatic:** tools with `readOnlyHint: true` run freely; every other tool is held for the client's Approve, and `destructiveHint: true` gets an extra warning.
- Extra tools not in the docs include: `ads_catalog_get_businesses` (**lists businesses, so no direct call needed for that**), `ads_duplicate_entity`, `ads_creative_update`, `ads_creative_delete`, `ads_dataset_create`, `ads_get_async_result`, `ads_insights_performance_vs_peers`, `ads_catalog_list_partner_integrations` (Shopify, WooCommerce…), `ads_create_upload_url` + `ads_finalize_upload`, `offer_report`.
- Tools to **hide from our agent**: app-only ones (`ads_get_ad_preview_screenshot`, `ads_log_ui_interaction`, `ads_creative_upload_local_image`, `ads_finalize_local_ad_image_upload`, `ads_delete_local_ad_image`), `offer_report` (Meta's own scheduled reports), and in stage A `ads_update_custom_audience_users` (customer-list upload, not covered by our Privacy Policy).
- `ads_get_ad_accounts` returned one ad account (`USD`, active, payment method set, `is_ads_mcp_enabled: true`) with **no business attached**. For the screencast and reviewer, use an ad account inside the Autommerce Platform business portfolio so the business, catalog and Page parts show real data.
- No `x-business-use-case-usage` header on this call; rate tracking will read it when present.
- This run is the first `ads_mcp_management` API call, which App Review needs.

**Updated list of direct Graph API calls (not via MCP):** Page posts (`GET /{page-id}/posts`, `pages_read_engagement`), token exchange, and revoke (`DELETE /me/permissions`). Businesses now come from the MCP.

---

## Stage A: minimum for App Review

### A0. Meta dashboard (you, guided)

1. **Facebook Login for Business → Configurations → Create**: login variation "General", token type "User access token", assets: ad accounts, Pages, catalogs, businesses; permissions: the 8 above. Copy the **Configuration ID**.
2. **Facebook Login for Business → Settings → Valid OAuth Redirect URIs**: add `https://platform.autommerce.com/api/meta-ads/oauth/callback` (plus the local dev URL if needed).
3. **App settings → Basic**: copy the **App Secret** straight into the server environment. Never paste it in chat.
4. **App roles → Testers**: add the accounts used for the screencast and the reviewer.

Server environment variables: `META_APP_ID`, `META_APP_SECRET`, `META_LOGIN_CONFIG_ID`, `META_OAUTH_REDIRECT_URI`.

### A1. Connection (backend)

| Piece | Where (mirrors Google Ads) |
|---|---|
| Table `meta_ads_connections`: workspace id, Meta user id, encrypted token, expiry, granted scopes, selected business, ad account, Page, catalog, status, connected by, timestamps | `supabase/migrations/` (RLS: workspace members read, server writes) |
| Start login: signed state (workspace, user, expiry), redirect to Facebook with `config_id` | `src/app/api/meta-ads/oauth/start/route.ts`, state signing like `src/lib/analytics/oauth.ts` |
| Callback: check state, swap code for token, check granted scopes, encrypt and save | `src/app/api/meta-ads/oauth/callback/route.ts`, `src/lib/meta-ads/connection.server.ts` |
| List and pick assets: businesses, ad accounts, Pages, catalogs | `src/app/api/meta-ads/connection/route.ts` |
| Disconnect: revoke on Meta (`DELETE /me/permissions`), delete the token at once, delete cached Meta data within 30 days | same route, `DELETE` |
| Deauthorize callback: when a client removes the app inside Facebook, Meta pings us and we disconnect the same way | `src/app/api/meta-ads/deauthorize/route.ts` (signed request checked with the app secret); URL set in the dashboard |
| Expiry: store token expiry, show "Reconnect" before it ends (user tokens last about 60 days) | connection route + panel |
| Only workspace owners/admins can connect or disconnect | reuse the Google Ads access checks |

### A2. Agent through the Ads MCP server

1. In `assistant-service`, add a Meta platform next to `src/store-agent/google-ads/`: `src/store-agent/meta-ads/` (instructions, platform, tools).
2. The site gives the agent run the client's decrypted token for that one run only (signed site ↔ agent requests, as in `src/lib/google-ads/agent-auth.server.ts`). The token never reaches the browser and is never logged.
3. The agent connects to the Ads MCP server with that token and lists its tools.
4. **Approval rule:** read tools run freely; any tool that changes or spends (create, edit, pause, budget) is held as a proposed change and runs only after the client clicks Approve. This is our safety rule and what the Privacy Policy promises.
5. Every executed change is written to the change history.
6. The Meta Ads chat uses this live agent when the workspace is connected, and keeps the simulation for demo workspaces (same switch as `setLiveAgentHandler` in Google Ads).

### A3. Simple live panel

A small "Connected Meta account" panel in the Meta Ads tab (connections view, `src/components/meta-ads/views/connections.tsx`), showing real data:

| Shows | Permission |
|---|---|
| Logged-in Meta user name | `public_profile` |
| Business portfolios | `business_management` |
| Ad accounts and recent campaigns with spend (last 30 days) | `ads_read` |
| Pages | `pages_show_list` |
| Latest posts of the selected Page | `pages_read_engagement` |
| Catalogs and product count (plus one approved catalog edit) | `catalog_management` |
| Disconnect button | data deletion |

The rest of the Meta Ads tab stays on demo data in stage A, clearly labeled "Demo data".

### A4. Policy items

1. **Developer Policy §10.7:** Meta performance data must not flow to the Google Ads agent. Check platform commit `81bd68d` (shared business store `src/lib/ads-shared/business-store.ts`): sharing the business profile is fine; Meta metrics, audiences or campaign data are not.
2. The Disconnect steps in the UI must match `/data-deletion/` on the website.
3. Never ask for Facebook passwords; never show or share tokens.

### A5. Reviewer access

- A reviewer login on platform.autommerce.com with a workspace already connected to a Meta **test ad account** (or a real one with no spend).
- Login details go in the App Review form only.

### A6. Done when (screencast checklist)

Video in 1080p, English UI, starting logged out:

1. Log in to platform.autommerce.com.
2. Open Meta Ads → Connect Meta → Facebook popup showing "Autommerce platform" and the permissions → choose business, ad account, Page, catalog.
3. Panel shows name, businesses, ad accounts with campaigns and spend, Pages, Page posts, catalogs.
4. Ask the agent about performance (read through MCP).
5. Ask the agent to pause a campaign or change a budget → change proposed → Approve → shown as done on Meta and in history (`ads_management`, `ads_mcp_management`).
6. One approved catalog change (`catalog_management`).
7. Disconnect → data gone.

When all of this works, return to the roadmap phases 8 and 9 (record and submit).

---

## Stage B: full Meta Ads tab (after approval)

Start only after Meta approves stage A's permissions and the app is Live.

1. **Live data source:** implement `MetaAdsDataSource` in `src/lib/meta-ads/data-source.ts` for real accounts (campaigns, ad sets, ads, creatives, insights by date range, breakdowns), with server-side caching and refresh limits like Google Ads (`src/lib/google-ads/live-api.ts`, `refresh-limit.ts`).
2. **All views live:** overview, campaigns, ad sets, ads, creatives, insights, reports, targeting, calendar, catalog, experiments, rules, lead forms (lead forms need `leads_retrieval`, a new review request).
3. **Approved changes for every editor:** run the existing `MutateOp`s (`src/lib/meta-ads/mutations.ts`) for real, validate first, keep undo.
4. **Agent documents and reports** on live data.
5. **Marketing API Access Tier upgrade:** after 500 calls in 15 days with under 15% errors, click Upgrade in the dashboard.
6. **New permissions** (only if a feature needs them): `leads_retrieval`, `pages_manage_ads`, `instagram_basic`. Each needs its own App Review with a screencast.
7. **Yearly Data Use Checkup.**

## Stage A: what was built (November 18, 2026)

| Part | Files |
|---|---|
| Database: `meta_ads_connections` (encrypted token, no browser access), `meta_ads_changes`, chat domain `meta_ads` | `supabase/migrations/20261118_meta_ads_connections.sql` |
| Login, token exchange (long-lived), scopes check, encrypted storage, asset choice, Disconnect (revoke on Meta + delete token, change log and Meta chats), deauthorize callback, `appsecret_proof` on Graph calls | `src/lib/meta-ads/connection.server.ts`, `src/app/api/meta-ads/oauth/{start,callback}`, `connection`, `deauthorize` |
| Ads MCP client (HTTP + SSE, sessions, tool list cache) and tool rules (hidden tools, read vs write from Meta's annotations, approval card) | `src/lib/meta-ads/mcp.server.ts`, `src/lib/meta-ads/mcp-tools.ts` |
| Assets list and live panel data (campaigns, Page posts, catalog products) | `src/lib/meta-ads/live.server.ts`, `src/app/api/meta-ads/{assets,panel}` |
| Agent endpoint (signed, owner/admin, chat must be a Meta chat; read, preview, apply with approval binding, never twice; page posts) | `src/app/api/meta-ads/agent/[action]/route.ts` |
| Chat engine: third domain `meta_ads` (owner/admin, preview password, Meta connected; approvals; no undo) | `src/lib/store-agent/{protocol,server}.ts`, store-agent routes, chat UI labels |
| Agent service: Meta tools (`meta_tool_info`, `meta_read`, `meta_change`, `meta_page_posts`), Vera's Meta rules with Meta's tool catalog, runner wiring | `assistant-service/src/store-agent/meta-ads/*`, `runner.ts` |
| Page: real "Connect with Facebook" banner over the demo; when connected, asset picker, Vera's live chat, connection card (expiry, Reconnect, Change assets, Disconnect) and live panel | `src/components/meta-ads/ma-live.tsx`, `ma-shell.tsx` |
| Policy §10.7: the Google agent no longer receives memories the Meta agent learned; workspace deletion also disconnects Meta | `src/lib/google-ads/agent-runner.ts`, `src/lib/workspace-purge.ts` |
| Tests | `src/lib/meta-ads/meta-live.test.ts` (tool rules, approval binding, login state, signed_request, appsecret_proof, asset ids) |

Server environment variables (site): `META_APP_ID`, `META_APP_SECRET`, `META_LOGIN_CONFIG_ID`, optional `META_OAUTH_REDIRECT_URI` (default `<site>/api/meta-ads/oauth/callback`). Also needs the existing `INTEGRATION_ENCRYPTION_KEY`, `ASSISTANT_SERVICE_SECRET`, `STORE_AGENT_ENABLED`, and the agent service's `PLATFORM_URL`.

Done since (November 18, 2026):
- A0 dashboard setup done (login configuration with the 7 permissions; `public_profile` is automatic and assets are chosen by the client in the popup because the token type is "User access token"; redirect and deauthorize URLs set). Env vars set locally.
- Migration applied (tables checked from the site's keys).
- Probe re-run with input formats. Fixed: `ads_get_ad_entities` takes `level` (+ `date_preset`, `reporting_purpose`); `ads_catalog_list_products` takes `entity_id`; campaign lists arrive as a JSON string inside the JSON; money arrives as `{ value, unit }` / `{ amount, currency }`. Every Meta tool takes `client_conversation_id` (20 letters/digits, same per conversation): the site adds one derived from the chat id (the panel uses one per workspace), and the approval card hides Meta's bookkeeping fields. Panel calls checked live, read-only.

Still to finish in stage A:
- Hosting: same env vars on platform.autommerce.com, deploy the site and the agent service.
- End-to-end test with the real login; then the screencast (roadmap phase 8).

## Status

| Stage | Status |
|---|---|
| Verify MCP facts | **Done** (Nov 18, 2026): docs, live server and probe all confirm |
| Stage A | **Built** (Nov 18, 2026); waiting for A0 dashboard setup, migration, env vars and the end-to-end test |
| Stage B | Waiting for approval |

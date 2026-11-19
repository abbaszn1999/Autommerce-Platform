# Meta App Review: full roadmap

Goal: Autommerce clients connect **their own** Facebook / Meta ad accounts to the Autommerce platform, and our AI agent manages their ads with their approval.
To allow that for any client (not only us), Meta must approve our app **"Autommerce platform"** (App ID `1163327572927496`) for **Advanced Access**.

Last updated: November 19, 2026.

---

## Where everything lives

| Thing | Where | What it is for |
|---|---|---|
| Business portfolio "Autommerce Platform" | business.facebook.com (Business Suite) | Our verified company (Mallah Cell). Ad accounts, pages, catalogs live here. |
| Meta app "Autommerce platform" | developers.facebook.com/apps/1163327572927496 | The app that asks clients for permission. Settings, use cases, review. |
| Graph API Explorer | developers.facebook.com/tools/explorer | Meta's web tool for making API calls by hand. **This is where the test calls are made.** No code, no website. |
| Website legal pages | autommerce.com/meta-privacy/, /meta-terms/, /data-deletion/ | Public pages Meta requires. Details in `meta-app-review-website.md`. |
| Platform (data-enrichment-ai) | platform.autommerce.com | Where clients click "Connect with Facebook" and use the Meta Ads tab. Stage A built (`meta-ads/connect-plan.md`). |
| Screencast requirements and script | `meta-ads/app-review-screencast.md` | Meta's official video rules, what each permission must show, the shot list, reviewer instructions. |

The website and the test calls are **separate things**. The website only holds the legal pages. The test calls are made in Graph API Explorer and never touch the website or the platform code.

---

## The phases

| # | Phase | Who | Status |
|---|---|---|---|
| 1 | Business Verification (Mallah Cell) | You | **Done** (Nov 11, 2026) |
| 2 | Website legal pages, deployed and crawler-readable | Me + you (deploy) | **Done** (Nov 17, 2026) |
| 3 | App Settings → Basic (URLs, icon, category, DPO) | You | **Done** |
| 4 | Use cases and permissions added ("Ready for testing") | You | **Done** (see list below) |
| 5 | Test API calls, one per permission | You, in Graph API Explorer | **Done** (Nov 18, 2026) |
| 6 | Clean the App Review request list; wait for API call counts | You + Meta | **Done** (Nov 19, 2026): ads_management 21, ads_read 20, business_management 23, catalog_management 5, pages_read_engagement 26 (check pages_show_list and ads_mcp_management > 0) |
| 7 | Build the real Meta connection in the platform (Stage A of `meta-ads/connect-plan.md`; Stage B comes after approval) | Me | **Built and merged** (Nov 18–19, 2026). Left: deploy, then fixes A–C below |
| 8 | Record the screencast | You (script by me) | After fixes A–C; script in `meta-ads/app-review-screencast.md` |
| 9 | Submit App Review | You (I write the texts) | After phase 8 |
| 10 | Go Live, then upgrade Marketing API tier | You | After approval |

Access Verification (Tech Provider) is **not** a phase: Meta retired it on Oct 9, 2026. The Alert Inbox item is not related and can be ignored.

---

## Phase 4: permissions (done)

All of these show **Ready for testing** in *Use cases → Create & manage ads → Customize*. That is correct. Nothing else to click there.

| Permission | We submit it for review? | Why we need it |
|---|---|---|
| `ads_management` | Yes | Create, pause, edit campaigns after the client approves |
| `ads_read` | Yes | Read campaigns and performance (insights) |
| `business_management` | Yes | List the client's business portfolios and their ad accounts |
| `catalog_management` | Yes | Read and update the client's product catalog |
| `pages_show_list` | Yes | List the client's Facebook Pages (ads run from a Page) |
| `pages_read_engagement` | Yes | Read Page posts so the agent can boost or reuse them |
| `public_profile` | Automatic | Name and ID of the person who logs in |
| `pages_manage_ads` | No (not now) | Only needed to create ads from new Page posts; leave it |
| Marketing API Access Tier | Later (phase 10) | Shows "Limited access". Upgraded after 500 calls |
| `email`, `threads_business_basic`, Business Asset User Profile Access | No | Not used. Do **not** click "Add to App Review" |

**Catalog API → Quickstart → "Set up use case"**: do **not** click it. It sets up a system user for *our own* catalog. Our clients use their own login, so we don't need it.

The other use cases (Measure performance, Ad leads, Ads MCP server) can stay added.

### App Review request list (cleaned Nov 18, 2026)

There is no separate "Request advanced access" button to wait for: Meta automatically puts every permission from the use cases into **Review → App Review → "Not submitted – New requests"**. That list is what gets submitted, and the screencast must show **every** item in it, or the whole submission is rejected. So unused items were removed with the trash icon (this removes them from the review only, not from the app).

| Kept in the request list | Removed from the request list |
|---|---|
| `ads_management` | `instagram_branded_content_ads_brand` |
| `ads_read` | `facebook_branded_content_ads_brand` |
| `business_management` | `pages_manage_ads` |
| `catalog_management` | `leads_retrieval` |
| `pages_show_list` | `instagram_basic` |
| `pages_read_engagement` | Marketing API Access Tier (requested later, phase 10) |
| `public_profile` | |
| `ads_mcp_management` (keep only if the agent uses Meta's Ads MCP server; decided in phase 7) | |

Do **not** click **Next** on that page until phase 8 (screencast) is done.

---

## Phase 5: test API calls (do this now)

Why: each permission must have **at least one successful API call** before Meta lets us request advanced access. Today the "API Calls" column shows **0** for all of them. These calls make it go above 0.

An empty result (`"data": []`) still counts as successful. Only red error messages don't count.

### 5.1 Get a token

1. Open https://developers.facebook.com/tools/explorer/
2. Right panel:
   - **Meta App**: `Autommerce platform`
   - **User or Page**: `Get User Access Token`
   - **Permissions** → add: `ads_management`, `ads_read`, `business_management`, `catalog_management`, `pages_show_list`, `pages_read_engagement`
3. Click **Generate Access Token**. In the Facebook popup, choose **all** businesses, pages and ad accounts and allow everything.

### 5.2 Make the calls

In the box at the top, keep **GET**, type the path, click **Submit**. Write down the ids you get.

| # | Method | Path to type | Permission it uses | Write down |
|---|---|---|---|---|
| 1 | GET | `me?fields=id,name` | public_profile | — |
| 2 | GET | `me/businesses` | business_management | business `id` |
| 3 | GET | `me/adaccounts?fields=id,name` | ads_read / ads_management | ad account id (starts with `act_`) |
| 4 | GET | `act_XXX/campaigns?fields=id,name,status` | ads_management | — |
| 5 | GET | `act_XXX/insights?date_preset=last_30d` | ads_read | — |
| 6 | GET | `BUSINESS_ID/owned_product_catalogs` | catalog_management | catalog id, if any |
| 7 | GET | `me/accounts?fields=id,name` | pages_show_list | page `id` |
| 8 | GET | `PAGE_ID/posts` (see note) | pages_read_engagement | — |

Note for call 8: in the right panel, change **User or Page** to your Page ("Autommerce Platform" page), then run `PAGE_ID/posts`. Page posts need a Page token.

If call 6 returns an empty list, create a test catalog so catalog_management has a write call too:
- Method **POST**, path `BUSINESS_ID/owned_product_catalogs`, add parameter `name` = `Test catalog`. Submit. (You can delete it later in Commerce Manager.)

Optional write call for `ads_management` (safe, spends nothing because it is **paused** and has no ads):
- Method **POST**, path `act_XXX/campaigns`, parameters:
  - `name` = `API test - delete me`
  - `objective` = `OUTCOME_TRAFFIC`
  - `status` = `PAUSED`
  - `special_ad_categories` = `[]`
  - if the error mentions budget sharing, also add `is_adset_budget_sharing_enabled` = `false`
- Then delete it: Method **DELETE**, path = the campaign id it returned.

### 5.3 Check

Go back to *Use cases → Create & manage ads → Customize*. The **API Calls** column can take up to 24 h to update. When every permission above shows a number above 0, phase 5 is done.

If any call shows a red error, screenshot it and send it to me.

---

## Phase 6: request list and API call counts

The permissions are already queued in **Review → App Review → "Not submitted – New requests"** (cleaned list in phase 4 above). Within ~24 h of the test calls, the **API Calls** column in *Use cases → Create & manage ads → Customize* should show numbers above 0. If it still shows 0 after 24 h, re-run the phase 5 calls.

Don't click **Next** on the App Review page yet: the submission needs the screencast (phase 8). This wait does not block phase 7.

Don't click **Publish** either. The app stays Unpublished (development mode) until approval.

---

## Phase 7: build the platform connection (me, only when you say start)

What gets built in `data-enrichment-ai`:
1. **Connect Meta** button → Facebook Login for Business → client approves the permissions above.
2. Store the client's token encrypted, one per workspace.
3. Meta Ads tab shows the client's real ad accounts, campaigns, insights, pages, catalogs.
4. The AI agent proposes changes; nothing runs until the client clicks Approve. Undo where possible.
5. **Disconnect** button that removes access and deletes Meta data within 30 days (must match the `/data-deletion/` page).
6. Decide between Meta's official Ads MCP server and direct Marketing API calls for the agent's tools.

While the app is in development mode, only people with a role on the app (you, testers you add) can connect. That is enough for building and for the screencast.

---

## Phase 8: screencast (you)

One video, 1080p, English UI, starting **logged out**:
1. Open platform.autommerce.com, log in.
2. Click **Connect Meta**, go through the Facebook popup, show the permissions screen.
3. Show each permission being used: ad accounts and campaigns (ads_read), approve a change (ads_management), business list (business_management), catalog (catalog_management), pages list and posts (pages_show_list, pages_read_engagement).
4. Show **Disconnect**.

If one permission is not shown in the video, Meta rejects the whole submission.

---

## Phase 9: submit App Review

In *Review → App Review* (left menu), for each permission:
- Text: how we use it (I will write these).
- The screencast.
- Test login for the reviewer on platform.autommerce.com (a test account with a test ad account connected).

Also confirm: App Purpose = **Clients**, data handling questions, Privacy Policy URL (already set).

Meta's answer usually arrives in about a week. If rejected, they say why; we fix and resubmit.

---

## Phase 10: after approval

1. Switch the app to **Live** (Publish).
2. Any client can now connect.
3. After **500 Marketing API calls in 15 days with under 15% errors**, click **Upgrade** next to *Marketing API Access Tier* to get full (standard) limits.
4. Once a year, complete Meta's **Data Use Checkup** when it appears in Required actions.

---

## Things to fix before phase 8 (screencast)

| # | Fix | Why (Meta's requirement) | Who | Status |
|---|---|---|---|---|
| — | Deploy the site and the agent service with `META_APP_ID`, `META_APP_SECRET`, `META_LOGIN_CONFIG_ID` on the hosting | Nothing can be tested or recorded before | You | **Done** (Nov 19): connected live, Vera answered from the real account. Deploy again for A–C |
| — | Apply the other side's 3 merged migrations (confirm `drop_website_restructure` with them first) | Deploy needs the database to match | You | To do |
| A | Campaign table shows Impressions, Reach, Clicks, Spend, Conversions | ads_read / ads_management / ads_mcp_management videos must show these metrics in the app | Me | **Built** (Nov 19): Meta's own field names looked up live, period picker (30 days / 90 days / all time), plain column titles, refreshes after every approved change. Check on the deployed site |
| B | Vera can create, update and delete in a product catalog (approved on cards) | catalog_management video must show create, update and delete | Me | **Built** (Nov 19): create / rename catalog and add / delete products through Meta's MCP tools, delete a whole catalog with `graph_catalog_delete` (Graph API); "Product catalogs" card shows the result |
| C1 | Only the real "Connect with Facebook" when Meta is configured (no simulated demo login) | A reviewer clicking the demo login would see fake data | Me | **Built** (Nov 19): new connect page with what Autommerce can / never does and the policy links |
| C2 | `/data-deletion/` wording matches the Disconnect button | Deletion instructions must match the app | Me | **Built** in the website repo (Nov 19); deploy the website |
| C3 | Reviewer login on platform.autommerce.com with an active plan and credits; the preview password goes in the reviewer instructions | Reviewers who can't get in reject the whole submission | You | To do |
| — | Test data: an ad account inside the "Autommerce Platform" business with a campaign that has impressions, a Page with posts, a catalog | So every section of the video shows real data | You | To do |
| — | Website footer line "Confidential — For the office of the CEO." | Looks odd to a reviewer | You | Open |

Done:
- Developer Policy §10.7: the Google Ads agent no longer receives memories learned by the Meta agent, and the Meta agent can't write to the shared business profile (Nov 18, 2026).
- `ads_mcp_management` kept in the request list: the agent uses Meta's official Ads MCP server.

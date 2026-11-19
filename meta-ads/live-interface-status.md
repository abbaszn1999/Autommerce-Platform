# Meta Ads: what is connected (live) and what is left

Updated: Nov 19, 2026. This covers the real Meta connection on `/w/<workspace>/meta-ads`. Behind the preview password, it is shown to the workspace owner or an admin.

## What the user sees now

| Step | Screen | Data |
|---|---|---|
| 1 | **Connect page**: demo design, with the real "Connect with Facebook" button. No simulated login and no "demo data" badge. Shows what Autommerce can do and never does, plus the policy links. | Real Facebook Login for Business |
| 2 | **Facebook**: login, permissions, assets, Save | Meta's own screens |
| 3 | **Asset picker** ("Choose what Vera works on"): ad account, business portfolio, Facebook Page, catalog. The first item of each list is pre-selected. | Live from Meta |
| 4 | **Workspace**: Vera's chat on the left; on the right, a top bar (account, "Live from Meta", Refresh, Period) and 5 tabs, listed below | Live from Meta |

### The 5 tabs (all live data)

| Tab | Shows | Meta permission it proves |
|---|---|---|
| Overview | Totals: amount spent, impressions, reach, clicks, results. Top 5 campaigns by spend, latest 3 Page posts | ads_read |
| Campaigns | Every campaign: delivery, impressions, reach, clicks, spend, results; search | ads_read |
| Page posts | Post cards: picture, text, date, "Open on Facebook" | pages_read_engagement |
| Catalog | Products of the selected catalog; every shared catalog | catalog_management |
| Connection | Facebook user, ad account, business, Page, catalog, expiry date, permissions granted; Change assets, Reconnect, Disconnect | business_management, pages_show_list, data deletion |

### Vera (left side)

| Feature | Status |
|---|---|
| Reads the account through Meta's official ads MCP server | Built. **Currently failing** ("The agent ran into a problem"): another developer is fixing it |
| Changes (pause a campaign, budgets, and so on), each shown on a card and run only after you click Apply | Built, waiting on the fix above |
| Create, rename and delete a catalog, each approved | Built, waiting on the fix above |

## Removed

- The old simple connect page.
- The old page after login: stacked cards for Connected account, Campaigns, Latest Page posts, Catalog products and Product catalogs. Its content now lives in the 5 tabs.

## Not connected (demo only, never shown when Meta is set up on the server)

These demo pages stay in the code but don't appear on the live platform. They run only when Meta isn't configured, such as in a local demo:

- Simulated Facebook login and the demo account picker.
- Ad sets, Ads, Calendar, Creative library, Experiments, Lead forms, Opportunities, Reports.
- Insights (placements, demographics, trends and so on), Audiences, Targeting.
- Events Manager, Linked assets, Quality and safety, Billing, Account and campaign settings.
- Documents, Business profile, Rules and alerts, and the demo's simulated chat.

They would be connected later (Stage B in `connect-plan.md`), after Meta approves the app.

## Left to do for App Review

| # | Item | Owner |
|---|---|---|
| 1 | Commit and deploy `ma-live.tsx`, `ma-live-account.tsx` and `ma-live-common.tsx` | You |
| 2 | Fix Vera's run error | Other developer |
| 3 | Check the campaign numbers. The last recording showed 0 and "Not available" on every row; if the Overview totals are still 0, the metric field names need fixing | Me, after your screenshot |
| 4 | Record the video: `cd meta-ads/recording`, `npm run record`. `SKIP_AGENT=1` gives a test run without Vera; the final video needs Vera working | Me |
| 5 | Optional: a safe old campaign name in `CAMPAIGN_TO_PAUSE`, so the video shows a change to an ad (ads_management) | You |
| 6 | Reviewer account with an active plan and credits; preview password in the reviewer instructions | You |
| 7 | App Review texts for each permission, plus reviewer instructions | Me |
| 8 | Submit App Review | You |
| 9 | Delete the `META_TEST_TOKEN=` line from `.env` | You |

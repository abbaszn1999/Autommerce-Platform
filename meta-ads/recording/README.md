# Meta App Review screencast recorder

Records the video Meta's App Review needs, on the **real** platform (Meta rejects simulated demos). Requirements it follows are in `../app-review-screencast.md`.

## What it does

A fresh, logged-out Chromium window at **1440 × 900** (Meta: width 1440 or less), English UI, is driven step by step and recorded. A caption bar names each permission as it is shown:

| # | Shown | Permission |
|---|---|---|
| 1 | Starts logged out, logs in to Autommerce | (Meta: "from logged-out to logged-in") |
| 2 | Meta Ads page, **Connect with Facebook** | |
| 3 | Facebook Login for Business: login, permissions, assets, Allow (**you type your Facebook login; the script never reads it**) | all |
| 4 | Asset picker: each list opened (business portfolios, ad accounts, Pages, catalogs) | business_management, pages_show_list, ads_read, catalog_management |
| 5 | Connected Meta account card | business_management, pages_show_list |
| 6 | Campaigns table, **All time**: impressions, reach, clicks, spend, results | ads_read |
| 7 | Latest Page posts | pages_read_engagement |
| 8 | Catalog products | catalog_management |
| 9 | Vera summarizes the account (through Meta's ads MCP server) | ads_mcp_management, ads_read |
| 10 | Vera pauses a campaign: card → **Apply** → table refreshes | ads_management, ads_mcp_management |
| 11 | Vera creates a catalog → renames it → deletes it, each approved | catalog_management (create, update, delete) |
| 12 | **Disconnect** → back to Connect | data deletion |

No sound (Meta: reviewers don't listen).

## Run it

```powershell
cd meta-ads/recording
npm install
npx playwright install chromium
copy .env.example .env.local   # then fill it in (git-ignored)
npm run facebook               # once: log in to Facebook in the recorder profile, close the window
npm run record
```

`.env.local`:
- `WORKSPACE_SLUG` (required): the part after `/w/` in the platform address.
- `REVIEW_EMAIL`, `REVIEW_PASSWORD`: the Autommerce account to log in with (the reviewer account is best). Empty = you type them in the window.
- `PREVIEW_PASSWORD`: the Ads pages' preview password. Empty = you type it.
- `CAMPAIGN_TO_PAUSE`: a campaign safe to pause (an old or finished one). Empty = that step is skipped.
- `CAMPAIGN_TO_RENAME`: no active campaign? The ID (digits, safest) or exact name of a paused or old campaign. Vera renames it with " (reviewed)" (approved), then puts the old name back (approved). Used only when `CAMPAIGN_TO_PAUSE` is empty.
- Optional ids to pick in the asset picker.

Before recording: disconnect Meta on the platform (the video must show the connect flow). You don't need to log out of anything in your own Chrome: the recorder's browser is always fresh and logged out of Autommerce and Facebook.

The recorder uses its own Chrome profile (`.profile/`, git-ignored). Facebook stays logged in there after `npm run facebook`; Autommerce cookies are wiped before each recording so it starts logged out. During the run the script clicks through Facebook's screens itself (Continue as…, assets, Save) with a pause on each. Nothing to do unless Facebook asks for a login again.

Output: `out/meta-app-review-<date>.mp4`. Watch it before uploading; if a step failed, fix and run again (each run is a new recording).

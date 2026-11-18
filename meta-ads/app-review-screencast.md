# Meta App Review: screencast requirements and script

Checked November 18, 2026 against Meta's official pages:
- Screen recordings: https://developers.facebook.com/docs/app-review/submission-guide/screen-recordings
- Submission guide: https://developers.facebook.com/docs/app-review/submission-guide
- Common mistakes: https://developers.facebook.com/docs/app-review/submission-guide/common-mistakes
- Permissions reference (what each video must show): https://developers.facebook.com/docs/permissions/

## 1. Meta's rules for the video (official)

| Rule | Meta's words |
|---|---|
| Quality | "Record in high-resolution, ideally 1080 or better." "Decrease your monitor's resolution to a width of 1440 or less when you record." |
| Sound | "Omit audio; our reviewers will not listen to it." |
| Language | "Use English as the app UI language." Captions are needed for anything not self-explanatory. |
| Start | "Before you start a recording, log out of any test accounts you are using." "Capture the entire login flow, from logged-out to logged-in." |
| Login | Show the business login button and "the app user granting your app the permission you are demonstrating." "Capture the complete authorization flow." |
| Coverage | "Ensure that your screen recording shows your app using every permission and feature in your submission." A permission not shown is not approved. |
| Where | The use must be shown "on your app platform" (our app, not Graph API Explorer). |
| Rejections of the whole submission | Reviewers can't access the app; they can't find or use Facebook Login; a fake account; an app that looks incomplete. |
| Reviewer access | "Your app must be publicly available or you must provide instructions on how to access it." Meta uses its own test Facebook accounts; never give your personal Facebook login. |

Not specified by Meta: length, file size, format. MP4 is the safe choice; keep it under about 6 minutes.

## 2. What each permission's video must show (permissions reference)

| Permission | Meta asks the video to show | Where it is in our app |
|---|---|---|
| `ads_read` | Full login with the grant; a business reading its ads performance; metrics shown in the app: **Impressions, Conversions, Spend, Clicks, Reach** | Live panel "Campaigns · last 30 days" (**needs fix A**) and Vera's answer |
| `ads_management` | Same as `ads_read` (and the app managing ads) | Vera proposes a change (pause a campaign or change a budget) → Approve → done |
| `ads_mcp_management` | Same as `ads_read`; allowed use is AI agents managing ads through Meta's ads MCP server | Vera reading data and applying the approved change (all through the MCP server) |
| `business_management` | Login with the grant; the business accessing its data in the app | Asset picker "Business portfolio" list and the connection card |
| `catalog_management` | Login with the grant; "how your app user **creates, updates, and deletes** a product catalog on your app platform" | **Needs fix B** (catalog actions by Vera, approved on cards) |
| `pages_show_list` | Login with the grant; "the pages owned by the user are successfully connected with your app platform" | Asset picker "Facebook Page" list and the connection card |
| `pages_read_engagement` | Login with the grant; a Page post's content shown in the app | Live panel "Latest Page posts" |

## 3. App changes needed before recording

- **Fix A: metrics in the panel.** The campaign table shows only status and amount spent today. Meta asks for Impressions, Conversions, Spend, Clicks and Reach on screen. Request those fields in `ads_get_ad_entities` (their exact names come from Meta's `ads_get_field_context`) and show them as columns.
- **Fix B: catalog create / update / delete.** Meta's MCP server has create catalog, update catalog, and delete product / product set (no "delete catalog" tool). The video shows Vera, after approval: creating a test catalog, renaming it (update), adding one test product and then deleting that product. If "delete catalog" itself is required, it is one direct Graph API call (`DELETE /{catalog-id}`) to add as an approved action.
- **Fix C: reviewer access.**
  - A reviewer login on platform.autommerce.com with an active plan and credits.
  - The Meta Ads page unlocked for that account, or the preview password in the instructions.
  - The `/data-deletion/` page text matched to the real button: Meta Ads → Connected Meta account → Disconnect.
- **Test data:** an ad account inside the "Autommerce Platform" business with at least one campaign that has impressions, a Page with posts, and a catalog. A campaign with $0 spend shows zeros, which is allowed but weak.

## 4. How to record

- Tool: **OBS Studio** (free) or Windows **Win + Alt + R** (Xbox Game Bar records the browser window).
- Screen: set Windows display resolution to **1440 × 900 or 1366 × 768**, browser zoom 100 %, record 1080p if possible.
- Browser: a fresh Chrome profile or private window, English UI, Facebook in English (Facebook → Settings → Language).
- Log out of Facebook and of Autommerce before starting.
- No sound. Add short captions afterwards (Clipchamp, built into Windows) naming each permission when it appears.
- Upload the same video under every permission, and in each permission's notes give the time where it is shown (e.g. "pages_read_engagement: 02:10–02:30").

## 5. The script (one video, about 5 minutes)

| Time | Show | Caption | Permission |
|---|---|---|---|
| 0:00 | platform.autommerce.com, logged out → log in with the test account | "Logging in to Autommerce" | (login) |
| 0:20 | Open the workspace → **Meta Ads** | "Meta Ads page" | |
| 0:30 | Click **Connect with Facebook** → Facebook login (log in) → the dialog listing the permissions → choose the business, ad account, Page and catalog → **Continue / Allow** | "Facebook Login for Business: the user grants the permissions" | all |
| 1:10 | Back in Autommerce: the asset picker. Open each list: **Business portfolio**, **Ad account**, **Facebook Page**, **Product catalog**. Pick them → Continue | "Business portfolios (business_management) and Pages (pages_show_list) connected to Autommerce" | business_management, pages_show_list |
| 1:40 | The connection card: Facebook user, business, Page, catalog, granted permissions | "Connected Meta assets" | business_management, pages_show_list |
| 1:55 | Live panel → **Campaigns · last 30 days** table: Impressions, Reach, Clicks, Spend, Conversions | "Ads performance read from Meta (ads_read)" | ads_read |
| 2:15 | Live panel → **Latest Page posts**: post text and picture | "Page post content shown in Autommerce (pages_read_engagement)" | pages_read_engagement |
| 2:30 | Chat: "Summarize my campaigns' performance in the last 30 days" → Vera reads through Meta's tools and answers with the numbers | "AI agent reading the ad account through Meta's ads MCP server (ads_mcp_management, ads_read)" | ads_mcp_management, ads_read |
| 3:10 | Chat: "Pause campaign X" → approval card with the exact change → **Approve** → "applied" → show it paused (panel Refresh) | "The change runs only after the user approves (ads_management, ads_mcp_management)" | ads_management, ads_mcp_management |
| 3:45 | Chat: "Create a catalog called Review Test Catalog" → Approve → "Rename it to Review Test Catalog 2" → Approve → "Add one test product, then delete it" → Approve each | "Creating, updating and deleting in the product catalog (catalog_management)" | catalog_management |
| 4:40 | Connection card → **Disconnect** → confirm → back to the Connect screen | "Disconnect: access removed and Meta data deleted" | (data deletion) |
| 5:00 | End | | |

## 6. Reviewer instructions (draft for the App Review form)

1. Go to https://platform.autommerce.com and log in with: email `<reviewer email>`, password `<password>`.
2. Open the workspace "<name>" → **Meta Ads** in the sidebar.
3. Click **Connect with Facebook** and log in with your Meta test account. Allow the requested permissions and choose an ad account, business, Page and catalog.
4. The page shows the connected assets, the last 30 days of campaign results and the Page's latest posts.
5. In the chat on the left, ask the agent (Vera) e.g. "Summarize my campaigns", or "Pause campaign <name>". Every change appears on a card and runs only after you click Approve.
6. **Disconnect** (connection card) removes our access and deletes the data we received from Meta.

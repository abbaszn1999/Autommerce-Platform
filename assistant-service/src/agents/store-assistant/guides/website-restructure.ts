// Vera's guide for redesigning a store's header and navigation. It is read on demand
// (read_skill), so chats about anything else do not pay for it. The method comes
// from the former Website Restructure builder (vision, competitor research, IA
// planning, header building), rewritten for work inside the chat: Vera does each
// phase herself and the result is one HTML file shown on the right.

export const WEBSITE_RESTRUCTURE_DESCRIPTION =
  "Redesign a store's header and navigation: a new menu / mega menu built from the store's real categories, brands and best-fitting structure, delivered as a live HTML header. Use for any request about the store header, navigation, menu, mega menu, site structure or 'website restructure'.";

export const WEBSITE_RESTRUCTURE_SKILL = `# Website restructure: a new header and navigation for the store

You act as a senior information architect and front-end designer. You take the store's real catalogue and the look of its current header, and you deliver one new header (HTML) with a navigation that fits THIS store. Nothing here changes the store: the header is a design the owner or their developer installs. Say so at the end.

## Rules that never bend
- Structure comes from the store's real data (categories or collections, brands, product counts), never from a template or from what is common on other sites.
- Look comes from what is really in the owner's screenshots, logo and site. Never add an element that is not there ("Book a demo", "Start for free", "Pricing", a theme switcher, offers, awards, reviews). Never invent a number, a label or a link.
- Competitors give structure ideas only (how they group, how many columns). Never reuse their category names, wording or brand.
- You cannot read the store's current navigation menu (this agent has no access to it). The current menu comes from the owner's screenshots or from the public site with webFetch. If the site's header is built by scripts and the fetched page is empty, say so and ask for screenshots.
- Ask only for what you cannot get yourself. The store's address, categories, brands and counts you read; the owner supplies screenshots, logo and competitors.

## Phase 1: what you need (ask once, in one ask_user card)
1. Screenshots of the current header, ideally one with the main menu or mega menu open (up to 3). If there are none, the store's public address is enough to read with webFetch: say what you could not see.
2. The logo as an attachment, or "no logo" (then the header uses the store name as text).
3. Competitors: up to 5 names or addresses, or none.
4. Only if the profile and the store do not already say: the language and whether the store reads right to left.
Skip any item the user already gave in the message or attachments. Write the phases as updateTodos.

## Phase 2: read the catalogue
- Export the categories or collections with their product counts, and the brands (vendors), with the bulk export tool of this store, into files in your folder.
- With run_script build one digest and keep it in a file (outputs/nav-digest.json): the real hierarchy when the store has parent and child categories, brand groups, topic groups (a shared word or attribute across many categories, like "women" + "sunglasses"), each with its category count and product count. Check the totals against the store before relying on them.
- Say in two lines what the store looks like (how many categories, how deep, which brands matter).

## Phase 3: the current header (only from what you can see)
From the screenshots and the logo write a short design brief for yourself: real colors as hex read off the images, header height, the elements really present (logo, search, account, cart, language), how the open menu is laid out (columns, images, descriptions), and whether the text is right to left. If something is not visible, leave it out. Fonts: a system font stack only (system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif), because the header cannot download fonts when the developer installs it.

## Phase 4: competitors (skip when none)
For each, find the real storefront with webSearch and read its header with webFetch. Note only: the axis its top level is organised around (gender, brand, use, department, price), roughly how many columns its menu has and whether columns carry images or descriptions, and what it keeps out of the header (long-tail filters reached from the page instead). One short line each. If you cannot find its real navigation, say so; never guess.

## Phase 5: the structure
The one hard rule is 3-click reachability: every category page must be reachable in at most 3 clicks from the header (a department, then optionally a category, then optionally a subcategory). There is NO fixed number of departments, columns or levels. Decide per branch from its own weight:
- A small store (a few dozen categories) may need only a flat row of 5-8 departments.
- A medium store usually needs two levels.
- A very large store with a real hierarchy legitimately needs three levels and a large mega menu. A dominant department can go three deep while a small one stays a single link.
How to choose entries:
1. Trust the store's real hierarchy first; flatten or regroup only what breaks the 3-click rule.
2. A brand becomes an entry (a department, or a category under "Brands") when its categories and products are material compared with the rest; small brands fold under one "Brands" entry or the nearest category.
3. A topic group becomes an entry the same way when its combined reach is material. Deeper combinations stay out of the header; they are reached from the entry's own page.
4. Merge near-duplicate groups (a store category and a generated collection for the same thing) into one entry.
5. Use competitors' grouping axes as loose evidence only when the store's own groups support them.
6. Every category and group gets a home somewhere. Small leftovers go under one broad last entry (for example "More"); nothing is silently dropped.
Write the result as outputs/nav-plan.json: a tree of { label, level: "department" | "category" | "subcategory", refs: [the store's category ids or handles], children }. Labels are real words in the store's language, not raw tokens. With run_script check that every category appears in exactly one node, that no node is deeper than three levels, and that no label is empty or repeated at the same level. Fix what fails.
Then stop and ask the owner (ask_user, options such as "Looks good, build it" and "Change something") with a short summary: how many departments, how deep, which brands and topics got their own entry, and what you merged. Build only after they agree. If they ask for changes, change the plan file and ask again only if the change is large.

## Phase 6: build the header
Write ONE self-contained file, website-restructure/header.html, then open it with show_file. It is shown to the owner as the page.
- Plain HTML, CSS and JavaScript only: no frameworks, no external files, no icon libraries, no web fonts. (The panel allows scripts and inline images; it blocks every request.)
- Implement the plan faithfully: do not invent, drop, merge or reorder its entries, and build a large plan as a real mega menu instead of cutting it down. A large plan is correct for a large store.
- The new header keeps the store's visual identity (colors, height, chrome, spacing, logo, how the open menu is framed) from phase 3, never its old weaker menu structure.
- Icons: draw your own minimal inline SVG from simple shapes (rect, circle, line, polyline, short straight paths on a 24x24 box): menu, search, cart, chevron, account. Never reproduce a known icon set from memory.
- Every link's href is exactly "#". You are never given real store addresses and never assemble one from a category name. Nothing in the header navigates: no location changes, no window.open, no forms. A click only opens or closes the header's own menus.
- Logo: write <img src="{{LOGO}}" alt="..."> in the file, then call inline_image with the html file and the attached logo (it is in attachments/); it replaces the placeholder with the image itself, so nothing is loaded from outside. Call it after the file is final, and again after you rewrite the file. With no logo, show the store name as text. Never use a remote address.
- Menus open and close by click or keyboard focus, never by hover alone. Each toggle is a button with aria-expanded, each menu has role="menu" or an equivalent landmark, Escape closes an open menu, and the listeners are attached in the script (no inline onclick).
- Mobile: the header is responsive on its own (a drawer or accordion below about 900px) and styles only its own markup: no position:fixed on body and no 100vh tricks, because the developer places it inside an existing page.
- Right to left stores: dir="rtl" on the root wrapper and mirror spacing and alignment, not just text-align.
- Colors are the store's own and stay the same in light and dark mode. Put them in CSS variables on :root, but do NOT add the dark-mode variants that the general report rules ask for: this is a preview of the store's real header, not of the platform.
- Add a small line of notes under the header inside the file only when something material was assumed (for example a color you could not read).

## Phase 7: check, then report
Read the file back and check, in this order: every node of the plan is in the markup; every href is "#"; no http(s) address appears anywhere in the file; no external file or font; the logo is in place (no {{LOGO}} left) or the name is text; dir is right; the script's braces and brackets balance and its listeners point at ids and classes that exist in the markup. (run_script can count and match text in the file; it cannot run the page, so read the script once more with that in mind.) Fix what fails before you tell the owner.
Finish with a short summary in the owner's language: what the store's structure looks like now compared with what you saw in the screenshots, the plan in a few lines, anything you assumed or could not see, and that links are placeholders ("#") and that the header is a design to be installed by the owner or their developer. Offer: a different style, a change to the structure, the plan as an Excel or Word file (make_excel, make_document).

## Changes later in the chat
For a change to the header, edit the HTML (edit_file) or write header-v2.html (then v3...) when the change is large, keep the earlier file, and say what changed. For a change to the structure, update outputs/nav-plan.json first, then the header, and run the phase 7 checks again. Never rebuild from scratch for a small request.
`;

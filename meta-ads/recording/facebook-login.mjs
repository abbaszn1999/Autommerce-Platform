// One-time: log in to Facebook in the recorder's profile (not recorded).
// You type your login yourself; nothing is read or stored by this script
// (the browser keeps its own Facebook cookies in .profile, git-ignored).
//
//   npm run facebook   → log in → close the window.

import { openProfile } from "./browser.mjs";

const context = await openProfile();
const page = context.pages()[0] ?? (await context.newPage());
await page.goto("https://www.facebook.com/");
console.log("Log in to Facebook in the window (tick 'remember' if asked), then close the window.");
await new Promise((resolve) => context.on("close", resolve));
console.log("Saved. Facebook stays logged in for the recordings.");

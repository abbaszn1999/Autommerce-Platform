// What the setup screen would prefill for a workspace, read from its real Google accounts.
// npx tsx --env-file=.env.local scripts/business-profile-prefill-check.ts <workspaceId>

import { createClient } from "@supabase/supabase-js";
import { setupPrefill } from "../src/lib/business-profile-setup.server";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
setupPrefill(admin, process.argv[2] ?? "")
  .then((p) => console.log(JSON.stringify(p, null, 2)))
  .catch((e) => console.error("FAILED", e));

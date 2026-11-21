import { NextRequest, NextResponse } from "next/server";
import { expireGeneratedImages } from "@/lib/storage/expire-generated-images";
import { createAdminClient } from "@/lib/supabase-admin";

import { cronAuthorized } from "@/lib/auth/cron-secret";

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const admin = createAdminClient();
  if (!(await cronAuthorized(request, admin))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await expireGeneratedImages(admin);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[expire-generated-images]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Expire failed" },
      { status: 500 }
    );
  }
}

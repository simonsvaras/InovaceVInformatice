import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDatabase } from "@/db/client";
import { appMetadata } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [schemaMarker] = await getDatabase()
      .select({ value: appMetadata.value })
      .from(appMetadata)
      .where(eq(appMetadata.key, "schema_version"))
      .limit(1);

    if (!schemaMarker) {
      throw new Error("Database schema marker is missing.");
    }

    return NextResponse.json({
      status: "ok",
      database: "connected",
      schemaVersion: schemaMarker.value,
    });
  } catch {
    return NextResponse.json(
      { status: "unavailable", database: "unavailable" },
      { status: 503 },
    );
  }
}

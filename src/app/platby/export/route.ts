import { NextResponse } from "next/server";
import { notFound } from "next/navigation";

import { InputError, validateUuid } from "@/lib/validation";
import { requireUser } from "@/modules/auth/service";
import {
  exportPaymentRegisterCsv,
  parseRegisterFilters,
} from "@/modules/payments/reports";
import type { PaymentScope } from "@/modules/payments/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await requireUser();
  const params = new URL(request.url).searchParams;
  const teamId = params.get("teamId");
  const clubId = params.get("clubId");
  if ((!teamId && !clubId) || (teamId && clubId)) notFound();
  try {
    const scope: PaymentScope = teamId
      ? { teamId: validateUuid(teamId) }
      : { clubId: validateUuid(clubId!) };
    const filters = parseRegisterFilters({
      from: params.get("from") ?? undefined,
      to: params.get("to") ?? undefined,
      method: params.get("method") ?? undefined,
      state: params.get("state") ?? undefined,
    });
    const { csv, filename } = await exportPaymentRegisterCsv(user.id, scope, filters);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof InputError) {
      return new NextResponse(error.message, {
        status: 400,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    throw error;
  }
}

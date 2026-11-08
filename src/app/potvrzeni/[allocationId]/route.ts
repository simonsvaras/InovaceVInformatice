import { NextResponse } from "next/server";

import { InputError } from "@/lib/validation";
import { requireUser } from "@/modules/auth/service";
import {
  buildPaymentConfirmationPdf,
  getPaymentConfirmation,
} from "@/modules/payments/confirmation";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ allocationId: string }> },
) {
  const user = await requireUser();
  const { allocationId } = await params;
  try {
    const confirmation = await getPaymentConfirmation(user.id, allocationId);
    return new NextResponse(new Uint8Array(buildPaymentConfirmationPdf(confirmation)), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="potvrzeni-evidence-${confirmation.allocation_id.slice(0, 8)}.pdf"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof InputError) {
      return new NextResponse(error.message, {
        status: 409,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    throw error;
  }
}

import { sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { rateLimitBuckets } from "@/db/schema";
import { hashRateLimitKey } from "@/lib/tokens";
import { InputError } from "@/lib/validation";

export async function consumeRateLimit(
  scope: string,
  identifier: string,
  limit: number,
  windowMinutes: number,
) {
  const key = hashRateLimitKey(`${scope}:${identifier}`);
  const [bucket] = await getDatabase()
    .insert(rateLimitBuckets)
    .values({ key, attempts: 1, windowStartedAt: new Date() })
    .onConflictDoUpdate({
      target: rateLimitBuckets.key,
      set: {
        attempts: sql<number>`case when ${rateLimitBuckets.windowStartedAt} < now() - (${windowMinutes} * interval '1 minute') then 1 else ${rateLimitBuckets.attempts} + 1 end`,
        windowStartedAt: sql<Date>`case when ${rateLimitBuckets.windowStartedAt} < now() - (${windowMinutes} * interval '1 minute') then now() else ${rateLimitBuckets.windowStartedAt} end`,
      },
    })
    .returning({ attempts: rateLimitBuckets.attempts });

  if (bucket.attempts > limit) {
    throw new InputError(
      "rate_limited",
      "Příliš mnoho pokusů. Zkuste to prosím později.",
    );
  }
}

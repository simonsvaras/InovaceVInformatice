import { compare, hash } from "bcryptjs";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getDatabase } from "@/db/client";
import {
  passwordResetTokens,
  rateLimitBuckets,
  sessions,
  users,
} from "@/db/schema";
import {
  createOpaqueToken,
  hashOpaqueToken,
  hashRateLimitKey,
} from "@/lib/tokens";
import { InputError, normalizeEmail } from "@/lib/validation";
import {
  absoluteAppUrl,
  sendTransactionalEmail,
} from "@/modules/notifications/email";

const SESSION_COOKIE = "club_session";
const SESSION_DAYS = 30;
const PASSWORD_COST = 12;

export type AuthenticatedUser = {
  id: string;
  email: string;
  displayName: string;
};

function expiresInMinutes(minutes: number) {
  return new Date(Date.now() + minutes * 60_000);
}

async function consumeRateLimit(
  scope: string,
  identifier: string,
  limit: number,
  windowMinutes: number,
) {
  const database = getDatabase();
  const key = hashRateLimitKey(`${scope}:${identifier}`);
  const resetBefore = new Date(Date.now() - windowMinutes * 60_000);
  const now = new Date();
  const [bucket] = await database
    .insert(rateLimitBuckets)
    .values({ key, attempts: 1, windowStartedAt: now })
    .onConflictDoUpdate({
      target: rateLimitBuckets.key,
      set: {
        attempts: sql<number>`case when ${rateLimitBuckets.windowStartedAt} < ${resetBefore} then 1 else ${rateLimitBuckets.attempts} + 1 end`,
        windowStartedAt: sql<Date>`case when ${rateLimitBuckets.windowStartedAt} < ${resetBefore} then ${now} else ${rateLimitBuckets.windowStartedAt} end`,
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

export async function registerUser(input: {
  email: string;
  displayName: string;
  password: string;
}) {
  const database = getDatabase();
  const passwordHash = await hash(input.password, PASSWORD_COST);

  try {
    const [user] = await database
      .insert(users)
      .values({
        email: input.email,
        displayName: input.displayName,
        passwordHash,
      })
      .returning({ id: users.id });
    return user;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      throw new InputError(
        "email_exists",
        "Účet s tímto e-mailem už existuje.",
      );
    }
    throw error;
  }
}

export async function authenticateUser(emailInput: string, password: string) {
  const email = normalizeEmail(emailInput);
  await consumeRateLimit("login", email, 8, 15);

  const [user] = await getDatabase()
    .select({ id: users.id, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  const valid = user ? await compare(password, user.passwordHash) : false;

  if (!user || !valid) {
    throw new InputError(
      "invalid_credentials",
      "E-mail nebo heslo není správné.",
    );
  }

  return { id: user.id };
}

export async function createUserSession(userId: string) {
  const rawToken = createOpaqueToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await getDatabase().insert(sessions).values({
    tokenHash: hashOpaqueToken(rawToken),
    userId,
    expiresAt,
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, rawToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  const rawToken = (await cookies()).get(SESSION_COOKIE)?.value;

  if (!rawToken) {
    return null;
  }

  const [user] = await getDatabase()
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.tokenHash, hashOpaqueToken(rawToken)),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);

  return user ?? null;
}

export async function requireUser(): Promise<AuthenticatedUser> {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/prihlaseni");
  }

  return user;
}

export async function destroyCurrentSession() {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE)?.value;

  if (rawToken) {
    await getDatabase()
      .delete(sessions)
      .where(eq(sessions.tokenHash, hashOpaqueToken(rawToken)));
  }

  cookieStore.delete(SESSION_COOKIE);
}

export async function requestPasswordReset(emailInput: string) {
  const email = normalizeEmail(emailInput);
  await consumeRateLimit("password_reset", email, 4, 30);

  const database = getDatabase();
  const [user] = await database
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) {
    return;
  }

  const rawToken = createOpaqueToken();
  await database.transaction(async (transaction) => {
    await transaction
      .update(passwordResetTokens)
      .set({ consumedAt: new Date() })
      .where(
        and(
          eq(passwordResetTokens.userId, user.id),
          isNull(passwordResetTokens.consumedAt),
        ),
      );
    await transaction.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash: hashOpaqueToken(rawToken),
      expiresAt: expiresInMinutes(30),
    });
  });

  const link = absoluteAppUrl(`/reset-hesla?token=${rawToken}`);
  await sendTransactionalEmail({
    userId: user.id,
    recipient: user.email,
    kind: "password_reset",
    subject: "Obnovení hesla — Klubové platby",
    text: `Odkaz pro nastavení nového hesla platí 30 minut: ${link}\n\nPokud jste o změnu nežádali, zprávu ignorujte.`,
  });
}

export async function resetPassword(rawToken: string, newPassword: string) {
  const database = getDatabase();
  const tokenHash = hashOpaqueToken(rawToken);
  const passwordHash = await hash(newPassword, PASSWORD_COST);

  const changed = await database.transaction(async (transaction) => {
    const rows = await transaction.execute<{
      id: string;
      user_id: string;
    }>(sql`
      select id, user_id
      from password_reset_tokens
      where token_hash = ${tokenHash}
        and consumed_at is null
        and expires_at > now()
      for update
    `);
    const token = rows[0];

    if (!token) {
      return false;
    }

    await transaction
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, token.user_id));
    await transaction
      .update(passwordResetTokens)
      .set({ consumedAt: new Date() })
      .where(eq(passwordResetTokens.id, token.id));
    await transaction.delete(sessions).where(eq(sessions.userId, token.user_id));
    return true;
  });

  if (!changed) {
    throw new InputError(
      "invalid_reset",
      "Odkaz pro změnu hesla je neplatný nebo vypršel.",
    );
  }

}

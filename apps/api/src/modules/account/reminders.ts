import {
  PRESCRIPTION_DEFAULT_VALIDITY_MONTHS,
  PRESCRIPTION_REMINDER_DAYS,
} from '@optical/shared/account';
import { commerce } from '@optical/config/commerce';
import type { Db } from '../../infra/prisma';
import { queueEmail } from '../../infra/email/outbox';
import { effectiveExpiry } from './prescriptions';

const DAY_MS = 86_400_000;
const dateFormat = new Intl.DateTimeFormat(commerce.locale, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

function monthsBefore(date: Date, months: number): Date {
  const result = new Date(date);
  result.setUTCMonth(result.getUTCMonth() - months);
  return result;
}

/**
 * Emails a reminder, once, for each saved prescription (latest version)
 * that expires within the reminder window or expired in the last one.
 * Older expiries are left alone: no surprise emails about long-past dates.
 */
export async function remindExpiringPrescriptions(
  db: Db,
  options: { siteUrl: string; now?: Date; limit?: number },
): Promise<number> {
  const now = options.now ?? new Date();
  const horizon = new Date(now.getTime() + PRESCRIPTION_REMINDER_DAYS * DAY_MS);
  const floor = new Date(now.getTime() - PRESCRIPTION_REMINDER_DAYS * DAY_MS);
  const validity = PRESCRIPTION_DEFAULT_VALIDITY_MONTHS;
  const due = await db.prescription.findMany({
    where: {
      userId: { not: null },
      deletedAt: null,
      reminderSentAt: null,
      next: null,
      user: { deletedAt: null },
      OR: [
        { expiresAt: { lte: horizon, gte: floor } },
        {
          expiresAt: null,
          prescribedAt: {
            lte: monthsBefore(horizon, validity),
            gte: monthsBefore(floor, validity),
          },
        },
      ],
    },
    include: { user: { select: { email: true, name: true } } },
    take: options.limit ?? 100,
  });
  let sent = 0;
  for (const row of due) {
    const expiry = effectiveExpiry(row);
    if (!row.user || !expiry) continue;
    await db.$transaction(async (tx) => {
      // Claim it first, so two workers never send the same reminder.
      const claimed = await tx.prescription.updateMany({
        where: { id: row.id, reminderSentAt: null },
        data: { reminderSentAt: now },
      });
      if (claimed.count === 0 || !row.user) return;
      await queueEmail(tx, row.user.email, {
        template: 'prescription-expiring',
        data: {
          name: row.user.name.split(/\s+/)[0] ?? row.user.name,
          label: row.label,
          expiresOn: dateFormat.format(expiry),
          expired: expiry.getTime() < now.getTime(),
          accountUrl: `${options.siteUrl}/account/prescriptions`,
        },
      });
      sent += 1;
    });
  }
  return sent;
}

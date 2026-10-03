import type { Prisma } from '../../generated/prisma/client';
import type { Db } from '../prisma';
import { renderEmail, type EmailMessage } from '../../emails/render';
import type { EmailProvider } from './provider';

export const MAX_EMAIL_ATTEMPTS = 6;
/** How long a worker holds a claimed email before another may retry it. */
const LEASE_SECONDS = 120;

type Tx = Prisma.TransactionClient | Db;

/**
 * Queues an email in the same transaction as the change that causes it,
 * so an order can never be saved without its email (or the reverse).
 */
export async function queueEmail(tx: Tx, to: string, message: EmailMessage): Promise<void> {
  await tx.emailOutbox.create({
    data: { to, template: message.template, payload: message as unknown as Prisma.InputJsonValue },
  });
}

export interface DispatchResult {
  sent: number;
  failed: number;
}

/**
 * Sends due emails. Rows are claimed with SKIP LOCKED, so several workers
 * can run at once without sending anything twice. Failures back off
 * exponentially (1, 2, 4 … minutes) and give up after six attempts.
 */
export async function dispatchOutbox(
  db: Db,
  provider: EmailProvider,
  options: { limit?: number; now?: Date } = {},
): Promise<DispatchResult> {
  const now = options.now ?? new Date();
  const claimed = await db.$queryRaw<
    { id: string; to: string; payload: unknown; attempts: number }[]
  >`
    UPDATE "EmailOutbox" SET "sendAfter" = ${new Date(now.getTime() + LEASE_SECONDS * 1000)}
    WHERE id IN (
      SELECT id FROM "EmailOutbox"
      WHERE status = 'PENDING' AND "sendAfter" <= ${now}
      ORDER BY "createdAt"
      LIMIT ${options.limit ?? 20}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, "to", payload, attempts`;

  const result: DispatchResult = { sent: 0, failed: 0 };
  for (const row of claimed) {
    try {
      const rendered = await renderEmail(row.payload as EmailMessage);
      await provider.send({ to: row.to, ...rendered });
      await db.emailOutbox.update({
        where: { id: row.id },
        data: { status: 'SENT', sentAt: new Date(), attempts: row.attempts + 1, lastError: null },
      });
      result.sent += 1;
    } catch (error) {
      const attempts = row.attempts + 1;
      await db.emailOutbox.update({
        where: { id: row.id },
        data: {
          attempts,
          lastError: (error as Error).message.slice(0, 500),
          status: attempts >= MAX_EMAIL_ATTEMPTS ? 'FAILED' : 'PENDING',
          sendAfter: new Date(now.getTime() + 2 ** (attempts - 1) * 60_000),
        },
      });
      result.failed += 1;
    }
  }
  return result;
}

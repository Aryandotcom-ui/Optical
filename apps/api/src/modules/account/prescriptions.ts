import {
  PRESCRIPTION_DEFAULT_VALIDITY_MONTHS,
  PRESCRIPTION_REMINDER_DAYS,
  prescriptionInputSchema,
  type SavedPrescription,
  type SavedPrescriptionInput,
} from '@optical/shared/account';
import {
  hasBlockingIssues,
  validatePrescription,
  type Prescription as RxValues,
} from '@optical/shared/rx';
import { Prisma } from '../../generated/prisma/client';
import type { Db } from '../../infra/prisma';
import type { FileLinks, StorageProvider } from '../../infra/storage';
import { AppError } from '../../lib/app-error';

type PrescriptionRow = Prisma.PrescriptionGetPayload<object>;

const DAY_MS = 86_400_000;
const isoDate = (date: Date | null) => date?.toISOString().slice(0, 10) ?? null;
const parseDate = (value: string | null | undefined) =>
  value ? new Date(`${value}T00:00:00Z`) : null;

function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

/** The written expiry date, or the usual validity counted from the test date. */
export function effectiveExpiry(row: Pick<PrescriptionRow, 'expiresAt' | 'prescribedAt'>) {
  if (row.expiresAt) return row.expiresAt;
  return row.prescribedAt
    ? addMonths(row.prescribedAt, PRESCRIPTION_DEFAULT_VALIDITY_MONTHS)
    : null;
}

export function expiryState(expiry: Date | null, now: Date): SavedPrescription['expiry'] {
  if (!expiry) return 'unknown';
  if (expiry.getTime() < now.getTime()) return 'expired';
  if (expiry.getTime() - now.getTime() <= PRESCRIPTION_REMINDER_DAYS * DAY_MS) return 'expiring';
  return 'valid';
}

/**
 * Prescriptions saved to an account. Editing one never overwrites it: a
 * new version is added and the earlier ones stay in its history, so an
 * order always points at exactly the values its lenses were made to.
 */
export class AccountPrescriptions {
  constructor(
    private readonly db: Db,
    private readonly storage: StorageProvider,
    private readonly links: FileLinks,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private toSaved(row: PrescriptionRow, history: PrescriptionRow[]): SavedPrescription {
    const expiry = effectiveExpiry(row);
    return {
      id: row.id,
      label: row.label,
      version: row.version,
      values: (row.values as RxValues | null) ?? null,
      hasFile: row.fileKey !== null,
      previewUrl: row.fileKey ? this.links.url(row.fileKey) : null,
      status: row.status,
      prescribedAt: isoDate(row.prescribedAt),
      expiresAt: isoDate(expiry),
      expiry: expiryState(expiry, this.now()),
      createdAt: row.createdAt.toISOString(),
      history: history.map((entry) => ({
        id: entry.id,
        version: entry.version,
        createdAt: entry.createdAt.toISOString(),
      })),
    };
  }

  /** Latest version of each prescription, newest first, with its earlier versions. */
  async list(userId: string): Promise<SavedPrescription[]> {
    const rows = await this.db.prescription.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    const replaced = new Set(rows.map((row) => row.previousId).filter((id) => id !== null));
    return rows
      .filter((row) => !replaced.has(row.id))
      .map((latest) => {
        const history: PrescriptionRow[] = [];
        let previous = latest.previousId ? byId.get(latest.previousId) : undefined;
        while (previous) {
          history.push(previous);
          previous = previous.previousId ? byId.get(previous.previousId) : undefined;
        }
        return this.toSaved(latest, history);
      });
  }

  private validate(input: SavedPrescriptionInput) {
    const request = prescriptionInputSchema.parse(input);
    const issues = validatePrescription(request.rx, { requiresAdd: false });
    if (hasBlockingIssues(issues))
      throw new AppError(
        'VALIDATION_FAILED',
        'Some prescription values need attention.',
        issues
          .filter((issue) => issue.severity === 'error')
          .map((issue) => ({ path: `rx.${issue.path}`, message: issue.message })),
      );
    const prescribedAt = parseDate(request.prescribedAt);
    const expiresAt = parseDate(request.expiresAt);
    if (prescribedAt && prescribedAt.getTime() > this.now().getTime() + DAY_MS)
      throw new AppError('VALIDATION_FAILED', 'The test date is in the future.', [
        { path: 'prescribedAt', message: 'Use the date of your eye test.' },
      ]);
    if (prescribedAt && expiresAt && expiresAt <= prescribedAt)
      throw new AppError('VALIDATION_FAILED', 'The expiry date is before the test date.', [
        { path: 'expiresAt', message: 'Use a date after the test date.' },
      ]);
    return { ...request, prescribedAt, expiresAt };
  }

  private async findOwned(userId: string, id: string): Promise<PrescriptionRow> {
    const row = await this.db.prescription.findFirst({ where: { id, userId, deletedAt: null } });
    if (!row) throw AppError.notFound('That prescription is no longer in your account.');
    return row;
  }

  async create(userId: string, input: SavedPrescriptionInput): Promise<SavedPrescription> {
    const request = this.validate(input);
    const row = await this.db.prescription.create({
      data: {
        userId,
        label: request.label,
        values: request.rx,
        prescribedAt: request.prescribedAt,
        expiresAt: request.expiresAt,
      },
    });
    return this.toSaved(row, []);
  }

  /** Adds a new version. Only the latest version can be edited. */
  async update(userId: string, id: string, input: SavedPrescriptionInput) {
    const request = this.validate(input);
    const current = await this.findOwned(userId, id);
    const created = await this.db.$transaction(async (tx) => {
      const newer = await tx.prescription.findFirst({
        where: { previousId: id },
        select: { id: true },
      });
      if (newer)
        throw new AppError('CONFLICT', 'There is a newer version of this prescription. Reload.');
      return tx.prescription.create({
        data: {
          userId,
          label: request.label,
          values: request.rx,
          prescribedAt: request.prescribedAt,
          expiresAt: request.expiresAt,
          previousId: current.id,
          version: current.version + 1,
          // The photo stays with it: the typed values usually come from it.
          fileKey: current.fileKey,
          fileMime: current.fileMime,
        },
      });
    });
    return (await this.list(userId)).find((entry) => entry.id === created.id);
  }

  /** Names aren't clinical, so renaming changes the label in place. */
  async rename(userId: string, id: string, label: string): Promise<SavedPrescription[]> {
    await this.findOwned(userId, id);
    await this.db.prescription.update({ where: { id }, data: { label } });
    return this.list(userId);
  }

  /**
   * Deletes a prescription and all its versions. Values and files are
   * erased, except where an order still needs them for the lenses made.
   */
  async remove(userId: string, id: string): Promise<SavedPrescription[]> {
    await this.findOwned(userId, id);
    const chain = await this.db.prescription.findMany({
      where: { userId, deletedAt: null },
      select: {
        id: true,
        previousId: true,
        fileKey: true,
        _count: { select: { orderItems: true } },
      },
    });
    const byId = new Map(chain.map((row) => [row.id, row]));
    const versions: typeof chain = [];
    for (let row = byId.get(id); row; row = row.previousId ? byId.get(row.previousId) : undefined)
      versions.push(row);
    await this.erase(versions);
    return this.list(userId);
  }

  /** Soft-deletes rows; erases the health data of any not referenced by an order. */
  async erase(
    rows: { id: string; fileKey: string | null; _count: { orderItems: number } }[],
  ): Promise<void> {
    const now = this.now();
    const unreferenced = rows.filter((row) => row._count.orderItems === 0);
    const sharedFiles = new Set(
      rows.filter((row) => row._count.orderItems > 0).map((row) => row.fileKey),
    );
    await this.db.$transaction([
      this.db.prescription.updateMany({
        where: { id: { in: rows.map((row) => row.id) } },
        data: { deletedAt: now },
      }),
      this.db.prescription.updateMany({
        where: { id: { in: unreferenced.map((row) => row.id) } },
        data: { values: Prisma.DbNull, fileKey: null, fileMime: null, label: 'Deleted' },
      }),
    ]);
    for (const row of unreferenced)
      if (row.fileKey && !sharedFiles.has(row.fileKey)) await this.storage.delete(row.fileKey);
  }
}

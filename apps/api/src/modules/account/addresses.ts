import type { AddressInput, SavedAddress } from '@optical/shared/account';
import { addressInputSchema } from '@optical/shared/account';
import type { ShippingAddress } from '@optical/shared/checkout';
import type { Prisma } from '../../generated/prisma/client';
import type { Db } from '../../infra/prisma';
import { AppError } from '../../lib/app-error';

/** Plenty for home, work, parents' and a few friends. */
export const MAX_ADDRESSES = 20;

type Tx = Prisma.TransactionClient | Db;
type AddressRow = Prisma.AddressGetPayload<object>;

export function toSavedAddress(row: AddressRow): SavedAddress {
  return {
    id: row.id,
    fullName: row.fullName,
    phone: row.phone,
    line1: row.line1,
    line2: row.line2,
    landmark: row.landmark,
    city: row.city,
    region: row.state,
    postalCode: row.postalCode,
    country: row.country,
    isDefault: row.isDefault,
  };
}

const columns = (address: ShippingAddress & { phone: string }) => ({
  fullName: address.fullName,
  phone: address.phone,
  line1: address.line1,
  line2: address.line2,
  landmark: address.landmark,
  city: address.city,
  state: address.region,
  postalCode: address.postalCode,
  country: address.country,
});

/** Makes one address the default, and no other. */
async function makeDefault(tx: Tx, userId: string, addressId: string): Promise<void> {
  await tx.address.updateMany({
    where: { userId, isDefault: true, id: { not: addressId } },
    data: { isDefault: false },
  });
  await tx.address.update({ where: { id: addressId }, data: { isDefault: true } });
}

/**
 * Saves a checkout address to the account, unless the same one is already
 * there. The first address saved becomes the default.
 */
export async function saveAddress(
  tx: Tx,
  userId: string,
  address: ShippingAddress & { phone: string },
): Promise<void> {
  const existing = await tx.address.findMany({
    where: { userId, deletedAt: null },
    select: { line1: true, postalCode: true, fullName: true },
  });
  const same = existing.some(
    (row) =>
      row.line1.toLowerCase() === address.line1.toLowerCase() &&
      row.postalCode === address.postalCode &&
      row.fullName.toLowerCase() === address.fullName.toLowerCase(),
  );
  if (same || existing.length >= MAX_ADDRESSES) return;
  await tx.address.create({
    data: { userId, ...columns(address), isDefault: existing.length === 0 },
  });
}

/** The address book. Deleting an address hides it; orders keep their own copy. */
export class AddressService {
  constructor(private readonly db: Db) {}

  async list(userId: string): Promise<SavedAddress[]> {
    const rows = await this.db.address.findMany({
      where: { userId, deletedAt: null },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });
    return rows.map(toSavedAddress);
  }

  private async owned(userId: string, id: string): Promise<AddressRow> {
    const row = await this.db.address.findFirst({ where: { id, userId, deletedAt: null } });
    if (!row) throw AppError.notFound('That address is no longer in your account.');
    return row;
  }

  async create(userId: string, input: AddressInput): Promise<SavedAddress> {
    const address = addressInputSchema.parse(input);
    const count = await this.db.address.count({ where: { userId, deletedAt: null } });
    if (count >= MAX_ADDRESSES)
      throw new AppError(
        'CONFLICT',
        `You can save up to ${MAX_ADDRESSES} addresses. Delete one you no longer use.`,
      );
    const row = await this.db.$transaction(async (tx) => {
      const created = await tx.address.create({ data: { userId, ...columns(address) } });
      if (address.isDefault || count === 0) await makeDefault(tx, userId, created.id);
      return tx.address.findUniqueOrThrow({ where: { id: created.id } });
    });
    return toSavedAddress(row);
  }

  async update(userId: string, id: string, input: AddressInput): Promise<SavedAddress> {
    const address = addressInputSchema.parse(input);
    await this.owned(userId, id);
    const row = await this.db.$transaction(async (tx) => {
      await tx.address.update({ where: { id }, data: columns(address) });
      if (address.isDefault) await makeDefault(tx, userId, id);
      return tx.address.findUniqueOrThrow({ where: { id } });
    });
    return toSavedAddress(row);
  }

  async setDefault(userId: string, id: string): Promise<SavedAddress[]> {
    await this.owned(userId, id);
    await this.db.$transaction((tx) => makeDefault(tx, userId, id));
    return this.list(userId);
  }

  /** Removes an address; if it was the default, the most recent other one takes over. */
  async remove(userId: string, id: string): Promise<SavedAddress[]> {
    const row = await this.owned(userId, id);
    await this.db.$transaction(async (tx) => {
      await tx.address.update({ where: { id }, data: { deletedAt: new Date(), isDefault: false } });
      if (!row.isDefault) return;
      const next = await tx.address.findFirst({
        where: { userId, deletedAt: null },
        orderBy: { updatedAt: 'desc' },
        select: { id: true },
      });
      if (next) await makeDefault(tx, userId, next.id);
    });
    return this.list(userId);
  }
}

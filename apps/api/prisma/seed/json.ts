import type { Prisma } from '../../src/generated/prisma/client';

/** Deep-copies a value into Prisma's JSON input type (drops undefined, dates become strings). */
export function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

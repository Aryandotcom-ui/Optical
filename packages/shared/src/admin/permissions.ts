/**
 * Who may do what in the admin. Staff run the day-to-day (orders,
 * prescriptions, stock, reviews, help articles) and can look at products
 * and customers; admins can also change the catalogue, lens prices,
 * coupons, settings and roles, and read the audit log.
 */
export const adminAreas = [
  'dashboard',
  'orders',
  'prescriptions',
  'inventory',
  'reviews',
  'content',
  'customers',
  'products',
  'lens',
  'coupons',
  'settings',
  'audit',
] as const;
export type AdminArea = (typeof adminAreas)[number];
export type AdminAccess = 'read' | 'write';
export type StaffRole = 'STAFF' | 'ADMIN';

const STAFF_WRITE: readonly AdminArea[] = [
  'orders',
  'prescriptions',
  'inventory',
  'reviews',
  'content',
];
const STAFF_READ: readonly AdminArea[] = [...STAFF_WRITE, 'dashboard', 'customers', 'products'];

export function canAccess(role: string, area: AdminArea, access: AdminAccess): boolean {
  if (role === 'ADMIN') return true;
  if (role !== 'STAFF') return false;
  return (access === 'write' ? STAFF_WRITE : STAFF_READ).includes(area);
}

/** Every area a role can open, and whether it can change things there. */
export function areasFor(role: string): { area: AdminArea; write: boolean }[] {
  return adminAreas
    .filter((area) => canAccess(role, area, 'read'))
    .map((area) => ({ area, write: canAccess(role, area, 'write') }));
}

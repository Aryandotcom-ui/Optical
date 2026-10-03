'use client';

import type { AdminArea, AdminMe } from '@optical/shared/admin';
import { createContext, useContext } from 'react';

export const AdminContext = createContext<AdminMe | null>(null);

/** The signed-in team member. Only used inside the admin shell. */
export function useAdmin(): AdminMe {
  const me = useContext(AdminContext);
  if (!me) throw new Error('useAdmin must be used inside the admin shell');
  return me;
}

/** Whether the current role can change things in an area (buttons hide otherwise). */
export function useCanWrite(area: AdminArea): boolean {
  return useAdmin().areas.some((entry) => entry.area === area && entry.write);
}

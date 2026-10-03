import type { Role } from '../../src/generated/prisma/client';

/**
 * Demo accounts for local development only. The seed prints these, and the
 * README lists them. They never exist in production because production
 * never runs the seed.
 */
export const demoUsers: {
  email: string;
  password: string;
  name: string;
  phone: string;
  role: Role;
}[] = [
  {
    email: 'admin@example.com',
    password: 'Admin#Lumen2026',
    name: 'Aditi Rao',
    phone: '+919800000001',
    role: 'ADMIN',
  },
  {
    email: 'staff@example.com',
    password: 'Staff#Lumen2026',
    name: 'Karan Shah',
    phone: '+919800000002',
    role: 'STAFF',
  },
  {
    email: 'asha@example.com',
    password: 'Asha#Lumen2026',
    name: 'Asha Kulkarni',
    phone: '+919800000003',
    role: 'CUSTOMER',
  },
  {
    email: 'rahul@example.com',
    password: 'Rahul#Lumen2026',
    name: 'Rahul Menon',
    phone: '+919800000004',
    role: 'CUSTOMER',
  },
];

export const demoAddresses = {
  'asha@example.com': {
    fullName: 'Asha Kulkarni',
    phone: '+919800000003',
    line1: '14, 2nd Cross, Indiranagar',
    line2: 'Near 100 Feet Road',
    city: 'Bengaluru',
    state: 'Karnataka',
    postalCode: '560038',
  },
  'rahul@example.com': {
    fullName: 'Rahul Menon',
    phone: '+919800000004',
    line1: 'B-702, Sea Breeze Apartments',
    line2: 'Carter Road, Bandra West',
    city: 'Mumbai',
    state: 'Maharashtra',
    postalCode: '400050',
  },
} as const;

export const guestCustomer = {
  email: 'guest.buyer@example.com',
  address: {
    fullName: 'Meera Iyer',
    phone: '+919800000005',
    line1: '22, Lake View Road',
    city: 'Guwahati',
    state: 'Assam',
    postalCode: '781005',
  },
} as const;

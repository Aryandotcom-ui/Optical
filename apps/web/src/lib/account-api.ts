import type {
  AddressInput,
  AuthSession,
  ChangePassword,
  Login,
  OrderList,
  Register,
  ReorderResult,
  ReturnRequest,
  SavedAddress,
  SavedPrescription,
  SavedPrescriptionInput,
  UpdateProfile,
  User,
  Wishlist,
} from '@optical/shared/account';
import type { OrderView } from '@optical/shared/checkout';
import { useSavedLists } from '@/stores/saved-lists';
import { bagCount } from '@/stores/bag';
import { call, fetchCart, refreshSession } from './bag-api';
import { setSignedIn, setSignedOut } from './session';

export { CommerceError } from './bag-api';

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/+$/, '');
const path = (value: string) => encodeURIComponent(value);
const orderToken = (token: string): Record<string, string> =>
  token ? { 'x-order-token': token } : {};

/** Downloads a file the API serves to signed-in customers, refreshing the sign-in once if needed. */
async function download(url: string, filename: string, headers: Record<string, string> = {}) {
  const get = () => fetch(url, { credentials: 'include', headers });
  let response = await get();
  if (response.status === 401 && (await refreshSession())) response = await get();
  if (!response.ok) throw new Error(`Download failed (${response.status})`);
  const href = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  link.click();
  setTimeout(() => {
    URL.revokeObjectURL(href);
  }, 10_000);
}

/**
 * After any sign-in: remember the customer, bring this browser's wishlist
 * into the account (and the account's into this browser), and refresh the
 * bag count, which now includes the merged guest bag.
 */
async function afterSignIn(session: AuthSession): Promise<AuthSession> {
  setSignedIn(session.user);
  const local = useSavedLists.getState().wishlist;
  try {
    const merged = await call<Wishlist>('POST', '/v1/account/wishlist/merge', {
      body: { items: local },
    });
    useSavedLists.setState({ wishlist: merged.items });
  } catch {
    // The local list stays; the next change syncs it.
  }
  await fetchCart().catch(() => undefined);
  return session;
}

export const authApi = {
  register: async (request: Register) =>
    afterSignIn(await call<AuthSession>('POST', '/v1/auth/register', { body: request })),
  login: async (request: Login) =>
    afterSignIn(await call<AuthSession>('POST', '/v1/auth/login', { body: request })),
  registerFromOrder: async (number: string, token: string, password: string) =>
    afterSignIn(
      await call<AuthSession>('POST', '/v1/auth/register-from-order', {
        body: { number, token, password },
      }),
    ),
  /** Signs out and forgets this browser's copy of account data. */
  logout: async () => {
    await call<null>('POST', '/v1/auth/logout').catch(() => null);
    useSavedLists.setState({ wishlist: [] });
    bagCount.set(0);
    setSignedOut();
  },
  forgotPassword: (email: string) =>
    call<{ sent: true }>('POST', '/v1/auth/forgot-password', { body: { email } }),
  resetPassword: (token: string, password: string) =>
    call<null>('POST', '/v1/auth/reset-password', { body: { token, password } }),
};

export const accountApi = {
  updateProfile: async (profile: UpdateProfile) => {
    const user = await call<User>('PATCH', '/v1/account/profile', { body: profile });
    setSignedIn(user);
    return user;
  },
  changePassword: (request: ChangePassword) =>
    call<null>('POST', '/v1/account/password', { body: request }),
  deleteAccount: async (password: string) => {
    await call<null>('POST', '/v1/account/delete', { body: { password } });
    useSavedLists.setState({ wishlist: [] });
    bagCount.set(0);
    setSignedOut();
  },
  downloadExport: () => download(`${API_URL}/v1/account/export`, 'lumen-account-data.json'),

  orders: (page = 1) => call<OrderList>('GET', `/v1/account/orders?page=${page}`),

  addresses: () => call<SavedAddress[]>('GET', '/v1/account/addresses'),
  addAddress: (address: AddressInput) =>
    call<SavedAddress>('POST', '/v1/account/addresses', { body: address }),
  updateAddress: (id: string, address: AddressInput) =>
    call<SavedAddress>('PUT', `/v1/account/addresses/${id}`, { body: address }),
  defaultAddress: (id: string) =>
    call<SavedAddress[]>('POST', `/v1/account/addresses/${id}/default`),
  removeAddress: (id: string) => call<SavedAddress[]>('DELETE', `/v1/account/addresses/${id}`),

  prescriptions: () => call<SavedPrescription[]>('GET', '/v1/account/prescriptions'),
  addPrescription: (input: SavedPrescriptionInput) =>
    call<SavedPrescription>('POST', '/v1/account/prescriptions', { body: input }),
  updatePrescription: (id: string, input: SavedPrescriptionInput) =>
    call<SavedPrescription>('PUT', `/v1/account/prescriptions/${id}`, { body: input }),
  renamePrescription: (id: string, label: string) =>
    call<SavedPrescription[]>('PATCH', `/v1/account/prescriptions/${id}`, { body: { label } }),
  removePrescription: (id: string) =>
    call<SavedPrescription[]>('DELETE', `/v1/account/prescriptions/${id}`),

  wishlist: () => call<Wishlist>('GET', '/v1/account/wishlist'),
  newShareLink: () => call<Wishlist>('POST', '/v1/account/wishlist/share'),
  sharedWishlist: (token: string) =>
    call<{ items: { id: string; slug: string }[] }>('GET', `/v1/wishlists/${path(token)}`),
};

/** Order self-service, for the account owner or a holder of the order link. */
export const orderActionsApi = {
  cancel: (number: string, token: string, note?: string) =>
    call<OrderView>('POST', `/v1/orders/${path(number)}/cancel`, {
      body: note ? { note } : {},
      headers: orderToken(token),
    }),
  requestReturn: (number: string, token: string, request: ReturnRequest) =>
    call<OrderView>('POST', `/v1/orders/${path(number)}/return`, {
      body: request,
      headers: orderToken(token),
    }),
  reorder: async (number: string, token: string) => {
    const result = await call<ReorderResult>('POST', `/v1/orders/${path(number)}/reorder`, {
      headers: orderToken(token),
    });
    await fetchCart().catch(() => undefined);
    return result;
  },
  /** Fetches the PDF (the token travels in a header, not the URL) and saves it. */
  downloadInvoice: (number: string, token: string) =>
    download(
      `${API_URL}/v1/orders/${path(number)}/invoice`,
      `invoice-${number}.pdf`,
      orderToken(token),
    ),
};

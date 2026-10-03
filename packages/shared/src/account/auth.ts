import { z } from 'zod';
import { emailSchema, phoneSchema } from '../checkout/address';
import { passwordProblem, passwordProblemMessages, PASSWORD_MAX_LENGTH } from './password-policy';

const nameSchema = z
  .string()
  .trim()
  .min(2, 'Enter your name.')
  .max(80, 'Use at most 80 characters.');

/** A new password, checked against the policy (and the email, when known). */
export const newPasswordSchema = z
  .string()
  .max(PASSWORD_MAX_LENGTH * 4, 'That password is too long.')
  .superRefine((value, ctx) => {
    const problem = passwordProblem(value);
    if (problem) ctx.addIssue({ code: 'custom', message: passwordProblemMessages[problem] });
  });

function emailInPassword(value: { email: string; password: string }, ctx: z.RefinementCtx) {
  if (passwordProblem(value.password, value.email) === 'contains-email')
    ctx.addIssue({
      code: 'custom',
      path: ['password'],
      message: passwordProblemMessages['contains-email'],
    });
}

export const registerSchema = z
  .object({
    name: nameSchema,
    email: emailSchema,
    password: newPasswordSchema,
    marketingOptIn: z.boolean().default(false),
  })
  .superRefine(emailInPassword)
  .meta({ id: 'Register' });
export type Register = z.input<typeof registerSchema>;

export const loginSchema = z
  .object({
    email: emailSchema,
    // Checked against the stored hash only; the policy applies to new passwords.
    password: z
      .string()
      .min(1, 'Enter your password.')
      .max(PASSWORD_MAX_LENGTH * 4),
  })
  .meta({ id: 'Login' });
export type Login = z.input<typeof loginSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema }).meta({ id: 'ForgotPassword' });

export const resetPasswordSchema = z
  .object({
    token: z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'This reset link is not valid.'),
    password: newPasswordSchema,
  })
  .meta({ id: 'ResetPassword' });
export type ResetPassword = z.input<typeof resetPasswordSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1)
      .max(PASSWORD_MAX_LENGTH * 4),
    newPassword: newPasswordSchema,
  })
  .meta({ id: 'ChangePassword' });
export type ChangePassword = z.input<typeof changePasswordSchema>;

/** Creates an account from a guest order, after checkout ("create an account after purchase"). */
export const registerFromOrderSchema = z
  .object({
    number: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2,5}-\d{2}-\d{6}$/),
    token: z.string().max(100),
    password: newPasswordSchema,
  })
  .meta({ id: 'RegisterFromOrder' });

export const userSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    email: z.string(),
    phone: z.string().nullable(),
    role: z.enum(['CUSTOMER', 'STAFF', 'ADMIN']),
    marketingOptIn: z.boolean(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'User' });
export type User = z.infer<typeof userSchema>;

/** The answer to signing in, registering or refreshing. */
export const authSessionSchema = z
  .object({
    user: userSchema,
    /** Items moved from this browser's guest bag into the account's bag. */
    mergedCartItems: z.number().int(),
  })
  .meta({ id: 'AuthSession' });
export type AuthSession = z.infer<typeof authSessionSchema>;

export const updateProfileSchema = z
  .object({
    name: nameSchema,
    phone: z.union([phoneSchema(), z.literal('').transform(() => null), z.null()]).default(null),
    marketingOptIn: z.boolean(),
  })
  .meta({ id: 'UpdateProfile' });
export type UpdateProfile = z.input<typeof updateProfileSchema>;

export const deleteAccountSchema = z.object({
  password: z
    .string()
    .min(1, 'Enter your password to confirm.')
    .max(PASSWORD_MAX_LENGTH * 4),
});

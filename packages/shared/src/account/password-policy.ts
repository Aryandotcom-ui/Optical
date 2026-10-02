/**
 * Password rules, with no schema library so the sign-up form can check as
 * you type. Length matters most (NIST SP 800-63B): at least 10 characters,
 * no composition rules, and no password from the most-used lists.
 */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

/** The most common passwords of 10+ characters in public breach lists. */
const COMMON = new Set([
  '1234567890',
  '0987654321',
  '1111111111',
  '0000000000',
  '1234512345',
  '123456789a',
  'a123456789',
  '1q2w3e4r5t',
  'q1w2e3r4t5',
  'qwertyuiop',
  'qwerty1234',
  'qwerty12345',
  'asdfghjkl1',
  'password12',
  'password123',
  'password1234',
  'passw0rd123',
  'iloveyou12',
  'iloveyou123',
  'princess12',
  'football12',
  'baseball12',
  'sunshine12',
  'welcome123',
  'welcome@123',
  'admin12345',
  'administrator',
  'letmein123',
  'monkey1234',
  'dragon1234',
  'abcdefghij',
  'abcd123456',
  'abc1234567',
  'zaq12wsxcde',
  '1qaz2wsx3edc',
  'india12345',
  'india@123',
  'mumbai1234',
  'delhi12345',
  'bangalore1',
  'cricket123',
  'sachin1234',
  'krishna123',
  'ganesh1234',
  'jaishriram',
  'changeme123',
  'trustno1234',
  'superman12',
  'starwars12',
  'computer12',
]);

export type PasswordProblem = 'too-short' | 'too-long' | 'too-common' | 'contains-email';

/** The first reason a password is unacceptable, or null when it is fine. */
export function passwordProblem(password: string, email = ''): PasswordProblem | null {
  if (password.length < PASSWORD_MIN_LENGTH) return 'too-short';
  if (password.length > PASSWORD_MAX_LENGTH) return 'too-long';
  const lower = password.toLowerCase();
  if (COMMON.has(lower) || /^(.)\1+$/.test(password)) return 'too-common';
  const local = email.split('@')[0]?.toLowerCase() ?? '';
  if (local.length >= 4 && lower.includes(local)) return 'contains-email';
  return null;
}

export const passwordProblemMessages: Record<PasswordProblem, string> = {
  'too-short': `Use at least ${PASSWORD_MIN_LENGTH} characters. A short phrase is easy to remember.`,
  'too-long': `Use at most ${PASSWORD_MAX_LENGTH} characters.`,
  'too-common': 'That password is one of the most used, so it is easy to guess. Choose another.',
  'contains-email': 'Your password should not contain your email address.',
};

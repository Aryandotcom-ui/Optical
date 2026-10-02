import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordProblem,
  type PasswordProblem,
} from '@optical/shared/account/password-policy';

/** The `auth.errors` translator. */
type Translate = (key: PasswordProblem, values: { min: number; max: number }) => string;

/** The policy message for a new password, or undefined when it is acceptable. */
export function newPasswordError(t: Translate, password: string, email = ''): string | undefined {
  const problem = passwordProblem(password, email);
  return problem ? t(problem, { min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH }) : undefined;
}

export { PASSWORD_MIN_LENGTH };

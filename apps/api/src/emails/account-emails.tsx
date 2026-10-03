import { brand } from '@optical/config/brand';
import { Text } from '@react-email/components';
import { EmailButton, EmailLayout, text } from './layout';

export interface WelcomeData {
  name: string;
  shopUrl: string;
  accountUrl: string;
}

/** Sent once, when an account is created. */
export function WelcomeEmail({ data }: { data: WelcomeData }) {
  return (
    <EmailLayout preview={`Your ${brand.name} account is ready.`}>
      <Text style={text.heading}>Welcome, {data.name}.</Text>
      <Text style={text.body}>
        Your account is ready. Your orders, saved prescriptions, addresses and wishlist now live in
        one place, on every device you sign in on.
      </Text>
      <Text style={text.body}>
        Save a prescription once and choose it next time you add lenses, with no retyping.
      </Text>
      <EmailButton href={data.accountUrl}>Go to your account</EmailButton>
      <Text style={{ ...text.small, marginTop: '24px' }}>
        You are receiving this because an account was created with this address at {data.shopUrl}.
        If that was not you, write to {brand.supportEmail} and we will close it.
      </Text>
    </EmailLayout>
  );
}

export interface PasswordResetData {
  name: string;
  resetUrl: string;
  expiresMinutes: number;
}

/** The link to choose a new password. Single use and short-lived. */
export function PasswordResetEmail({ data }: { data: PasswordResetData }) {
  return (
    <EmailLayout preview="Choose a new password for your account.">
      <Text style={text.heading}>Reset your password</Text>
      <Text style={text.body}>
        Hi {data.name}, someone (hopefully you) asked to reset the password for your {brand.name}{' '}
        account. The link works once, for the next {data.expiresMinutes} minutes.
      </Text>
      <EmailButton href={data.resetUrl}>Choose a new password</EmailButton>
      <Text style={{ ...text.small, marginTop: '24px' }}>
        If you did not ask for this, ignore this email: your password stays the same.
      </Text>
    </EmailLayout>
  );
}

export interface PasswordChangedData {
  name: string;
  /** Where to start a reset if this wasn't them. */
  forgotUrl: string;
}

/** Security notice after a password change or reset. */
export function PasswordChangedEmail({ data }: { data: PasswordChangedData }) {
  return (
    <EmailLayout preview="Your password was changed.">
      <Text style={text.heading}>Your password was changed</Text>
      <Text style={text.body}>
        Hi {data.name}, the password for your {brand.name} account was just changed, and other
        devices were signed out.
      </Text>
      <Text style={text.body}>
        If this was not you, reset your password now and write to {brand.supportEmail}.
      </Text>
      <EmailButton href={data.forgotUrl}>Reset my password</EmailButton>
    </EmailLayout>
  );
}

export interface PrescriptionExpiringData {
  name: string;
  label: string;
  /** e.g. "15 Nov 2026" */
  expiresOn: string;
  expired: boolean;
  accountUrl: string;
}

/** Reminder that a saved prescription is about to expire (or just has). */
export function PrescriptionExpiringEmail({ data }: { data: PrescriptionExpiringData }) {
  return (
    <EmailLayout
      preview={`Your prescription "${data.label}" ${data.expired ? 'has expired' : 'expires soon'}.`}
    >
      <Text style={text.heading}>Time for an eye test?</Text>
      <Text style={text.body}>
        Hi {data.name}, your saved prescription &ldquo;{data.label}&rdquo;{' '}
        {data.expired ? 'expired' : 'expires'} on {data.expiresOn}. Eyes change, so lenses made to
        an old prescription may not be as sharp as they should be.
      </Text>
      <Text style={text.body}>
        After your next eye test, add the new prescription to your account. We keep the old one in
        its history.
      </Text>
      <EmailButton href={data.accountUrl}>Update my prescription</EmailButton>
      <Text style={{ ...text.small, marginTop: '24px' }}>
        We send this reminder once per prescription.
      </Text>
    </EmailLayout>
  );
}

/** Confirms that an account was deleted. */
export function AccountDeletedEmail({ data }: { data: { name: string } }) {
  return (
    <EmailLayout preview={`Your ${brand.name} account has been deleted.`}>
      <Text style={text.heading}>Your account is deleted</Text>
      <Text style={text.body}>
        Hi {data.name}, as you asked, we deleted your account, saved prescriptions, addresses and
        wishlist, and signed you out everywhere.
      </Text>
      <Text style={text.body}>
        We keep order and invoice records for as long as tax law requires; they are no longer linked
        to an account. Write to {brand.supportEmail} with any questions.
      </Text>
    </EmailLayout>
  );
}

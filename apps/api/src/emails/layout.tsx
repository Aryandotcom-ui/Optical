import { brand } from '@optical/config/brand';
import { Body, Container, Head, Hr, Html, Preview, Section, Text } from '@react-email/components';
import type { ReactNode } from 'react';

export const colours = {
  ink: '#1D1D1F',
  muted: '#6E6E73',
  hairline: '#E5E5EA',
  accent: '#0B57D0',
  surface: '#F5F5F7',
  background: '#FFFFFF',
};

export const text = {
  body: { fontSize: '15px', lineHeight: '22px', color: colours.ink, margin: '0 0 12px' },
  small: { fontSize: '13px', lineHeight: '19px', color: colours.muted, margin: '0 0 8px' },
  heading: {
    fontSize: '24px',
    lineHeight: '30px',
    fontWeight: 600,
    color: colours.ink,
    margin: '0 0 12px',
  },
} as const;

/** Shared frame for every email: wordmark, content, support footer. */
export function EmailLayout({ preview, children }: { preview: string; children: ReactNode }) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body
        style={{
          backgroundColor: colours.surface,
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif',
          margin: 0,
          padding: '24px 0',
        }}
      >
        <Container
          style={{
            backgroundColor: colours.background,
            borderRadius: '16px',
            maxWidth: '560px',
            padding: '32px',
          }}
        >
          <Text
            style={{ fontSize: '20px', fontWeight: 600, margin: '0 0 24px', color: colours.ink }}
          >
            {brand.wordmark}
          </Text>
          {children}
          <Hr style={{ borderColor: colours.hairline, margin: '32px 0 16px' }} />
          <Section>
            <Text style={text.small}>
              Questions? Reply to this email or write to {brand.supportEmail}.
            </Text>
            <Text style={text.small}>{brand.legalName}</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

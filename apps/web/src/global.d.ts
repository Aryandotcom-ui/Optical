import type messages from '../messages/en.json';

declare global {
  type IntlMessages = typeof messages;
}

declare module 'next-intl' {
  interface AppConfig {
    Messages: typeof messages;
  }
}

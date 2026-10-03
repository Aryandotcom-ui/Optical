import { createTransport, type Transporter } from 'nodemailer';
import type { RenderedEmail } from '../../emails/render';

export interface OutgoingEmail extends RenderedEmail {
  to: string;
}

/** Sends one email. Throws on failure; the outbox retries. */
export interface EmailProvider {
  send(email: OutgoingEmail): Promise<void>;
}

/** SMTP: Mailpit locally (http://localhost:8025), any SMTP relay in production. */
export class SmtpEmailProvider implements EmailProvider {
  private readonly transport: Transporter;

  constructor(
    url: string,
    private readonly from: string,
  ) {
    this.transport = createTransport(url);
  }

  async send(email: OutgoingEmail): Promise<void> {
    await this.transport.sendMail({
      from: this.from,
      to: email.to,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
  }

  close(): void {
    this.transport.close();
  }
}

/** Keeps sent emails in memory, for tests. */
export class MemoryEmailProvider implements EmailProvider {
  readonly sent: OutgoingEmail[] = [];
  failNext = 0;

  send(email: OutgoingEmail): Promise<void> {
    if (this.failNext > 0) {
      this.failNext -= 1;
      return Promise.reject(new Error('SMTP unavailable'));
    }
    this.sent.push(email);
    return Promise.resolve();
  }
}

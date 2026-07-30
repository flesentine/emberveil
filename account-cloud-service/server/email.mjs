import nodemailer from 'nodemailer';

export function createEmailSender(config, logger = console) {
  const transport = config.smtp
    ? nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.secure,
        auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
      })
    : null;

  async function deliver({ to, subject, text }) {
    if (!transport || !config.smtp) {
      if (config.production) throw new Error('Email delivery is not configured.');
      logger.warn({ to, subject, developmentLink: text.match(/https?:\/\/\S+/)?.[0] }, 'Development authentication email');
      return;
    }
    await transport.sendMail({ from: config.smtp.from, to, subject, text });
  }

  function defer(message) {
    queueMicrotask(() => {
      void deliver(message).catch((error) => logger.error({ error }, 'Authentication email delivery failed'));
    });
  }

  return {
    sendVerification({ email, url }) {
      defer({
        to: email,
        subject: 'Verify your Emberveil account',
        text: `Verify your Emberveil account by opening this link:\n\n${url}\n\nIf you did not create this account, you can ignore this message.`,
      });
    },
    sendPasswordReset({ email, url }) {
      defer({
        to: email,
        subject: 'Reset your Emberveil password',
        text: `Reset your Emberveil password by opening this link:\n\n${url}\n\nIf you did not request a reset, you can ignore this message.`,
      });
    },
    sendDeletionVerification({ email, url }) {
      defer({
        to: email,
        subject: 'Confirm Emberveil account deletion',
        text: `Permanently delete your Emberveil account and cloud saves by opening this link:\n\n${url}\n\nIf you did not request deletion, do not open the link.`,
      });
    },
  };
}

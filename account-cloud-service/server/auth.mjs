import { betterAuth } from 'better-auth';
import { createEmailSender } from './email.mjs';

export function createAuth({ config, database, logger = console }) {
  const email = createEmailSender(config, logger);
  return betterAuth({
    appName: 'Emberveil',
    database,
    baseURL: config.publicBaseUrl,
    secret: config.authSecret,
    trustedOrigins: config.clientOrigins,
    emailAndPassword: {
      enabled: true,
      autoSignIn: false,
      requireEmailVerification: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: ({ user, url }) => email.sendPasswordReset({ email: user.email, url }),
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: false,
      expiresIn: 60 * 60 * 24,
      sendVerificationEmail: ({ user, url }) => email.sendVerification({ email: user.email, url }),
    },
    session: {
      expiresIn: 60 * 60 * 24 * 14,
      updateAge: 60 * 60 * 24,
      freshAge: 60 * 10,
      cookieCache: { enabled: false },
    },
    user: {
      deleteUser: {
        enabled: true,
        sendDeleteAccountVerification: ({ user, url }) =>
          email.sendDeletionVerification({ email: user.email, url }),
      },
    },
    advanced: {
      cookiePrefix: 'emberveil',
      useSecureCookies: config.production,
      defaultCookieAttributes: {
        httpOnly: true,
        secure: config.production,
        sameSite: 'lax',
        path: '/',
      },
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/email': { window: 60, max: 8 },
        '/sign-up/email': { window: 60 * 10, max: 5 },
        '/request-password-reset': { window: 60 * 10, max: 4 },
        '/send-verification-email': { window: 60 * 10, max: 4 },
        '/delete-user': { window: 60 * 10, max: 3 },
      },
    },
  });
}

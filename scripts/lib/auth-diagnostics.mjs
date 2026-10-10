function boundedInteger(value, maximum) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(numeric) && numeric > 0 && numeric <= maximum ? numeric : null;
}

// Only locally generated labels, booleans and validated numbers reach the log.
export function authDiagnostics(config) {
  return {
    gmailConfigured: config.smtp_host === 'smtp.gmail.com',
    smtpPort: boundedInteger(config.smtp_port, 65535),
    senderConfigured: !!config.smtp_admin_email,
    senderMatchesUsername: config.smtp_admin_email === config.smtp_user,
    smtpPasswordConfigured: !!config.smtp_pass,
    otpLength: boundedInteger(config.mailer_otp_length, 32),
    otpExpirySeconds: boundedInteger(config.mailer_otp_exp, 86400),
    passwordMinimum: boundedInteger(config.password_min_length, 1024),
    legacySigningSecretAvailable: !!config.jwt_secret,
  };
}

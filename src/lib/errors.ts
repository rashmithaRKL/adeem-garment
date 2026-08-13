const MESSAGES: Record<string, string> = {
  // Postgres
  '23505': 'This record already exists and may be a duplicate.',
  '23503': 'A related record is missing. Check the line or order referenced by this row.',
  '23514': 'A value in this record is outside the allowed range.',
  '42501': 'You do not have permission to perform this action.',
  PGRST301: 'Your session has expired. Please sign in again.',

  // Supabase Auth. These arrive as string codes on an AuthError, and without them
  // the raw wording leaks through to a supervisor who cannot act on it.
  over_email_send_rate_limit:
    'Supabase has hit its limit on confirmation emails for now — this project uses the '
    + 'free built-in mailer, which allows only a few per hour. Wait an hour and try again, '
    + 'or create the account under Authentication → Users in the Supabase dashboard with '
    + '"Auto Confirm User" ticked, which sends no email at all.',
  over_request_rate_limit: 'Too many attempts in a short time. Wait a minute and try again.',
  user_already_exists: 'An account already exists with that email address.',
  email_exists: 'An account already exists with that email address.',
  weak_password: 'That password is too weak. Use at least six characters.',
  email_address_invalid: 'That email address is not valid.',
  signup_disabled: 'Sign-ups are disabled for this project, so accounts must be created in the Supabase dashboard.',
  invalid_credentials: 'That email and password do not match an account.',
  email_not_confirmed: 'This account has not confirmed its email address yet, so it cannot sign in.'
};

/** Turns database, auth and parser failures into something a supervisor can act on. */
export function friendlyError(error: unknown): string {
  if (!error) return 'Something went wrong.';

  if (typeof error === 'object' && error !== null) {
    for (const key of ['code', 'error_code'] as const) {
      if (key in error) {
        const code = String((error as Record<string, unknown>)[key]);
        if (MESSAGES[code]) return MESSAGES[code]!;
      }
    }
  }

  const raw = error instanceof Error ? error.message : String(error);

  // Matched before the generic rules below, because the wording overlaps: an
  // "email rate limit exceeded" used to trip the file-size rule and tell an admin
  // adding an employee that their file was too large.
  if (/rate limit|too many requests/i.test(raw)) {
    return MESSAGES.over_email_send_rate_limit!;
  }
  if (/already registered|already exists/i.test(raw)) {
    return MESSAGES.user_already_exists!;
  }
  if (/unexpected token|corrupt|zip|central directory/i.test(raw)) {
    return 'The Excel file could not be read. Please verify that the file is a valid Excel document.';
  }
  if (/network|fetch failed/i.test(raw)) {
    return 'The connection dropped. Check your network and try again.';
  }
  // Anchored to file wording. The old rule was a bare /exceeded|too large/, which
  // swallowed any unrelated message containing the word "exceeded".
  if (/file (is |size )?(too large|larger than)|payload too large|exceeds the .*(size|limit)/i.test(raw)) {
    return 'That file is larger than the 25 MB limit.';
  }
  return raw;
}

const MESSAGES: Record<string, string> = {
  '23505': 'This record already exists and may be a duplicate.',
  '23503': 'A related record is missing. Check the line or order referenced by this row.',
  '23514': 'A value in this record is outside the allowed range.',
  '42501': 'You do not have permission to perform this action.',
  PGRST301: 'Your session has expired. Please sign in again.'
};

/** Turns database and parser failures into something a supervisor can act on. */
export function friendlyError(error: unknown): string {
  if (!error) return 'Something went wrong.';

  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = String((error as { code: unknown }).code);
    if (MESSAGES[code]) return MESSAGES[code]!;
  }

  const raw = error instanceof Error ? error.message : String(error);

  if (/unexpected token|corrupt|zip|central directory/i.test(raw)) {
    return 'The Excel file could not be read. Please verify that the file is a valid Excel document.';
  }
  if (/network|fetch failed/i.test(raw)) {
    return 'The connection dropped. Check your network and try again.';
  }
  if (/exceeded|too large/i.test(raw)) {
    return 'That file is larger than the 25 MB limit.';
  }
  return raw;
}

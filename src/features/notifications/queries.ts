import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth/AuthProvider';

export interface Notification {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  tone: 'green' | 'amber' | 'red' | 'blue';
}

/**
 * Derived from the employee's own upload history rather than a separate table -
 * one less thing to keep in sync. Swap in a notifications table when the
 * roadmap adds admin-authored messages.
 */
async function fetchNotifications(profileId: string): Promise<Notification[]> {
  const { data, error } = await supabase
    .from('excel_uploads')
    .select('id, original_filename, upload_version, valid_record_count, error_count, warning_count, processing_status, created_at')
    .eq('uploaded_by', profileId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw error;

  return (data ?? []).map((u) => {
    const failed = u.processing_status === 'failed';
    const hasIssues = u.error_count > 0;
    return {
      id: u.id,
      title: failed
        ? 'Import failed — ' + u.original_filename
        : hasIssues
          ? u.error_count + ' row' + (u.error_count > 1 ? 's' : '') + ' skipped in ' + u.original_filename
          : 'Import completed — ' + u.valid_record_count + ' records',
      body: u.original_filename + ' v' + u.upload_version + ' · ' +
        u.valid_record_count + ' records, ' + u.warning_count + ' warnings, ' + u.error_count + ' errors.',
      createdAt: u.created_at,
      tone: failed ? 'red' : hasIssues ? 'amber' : 'green'
    };
  });
}

export function useNotifications() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['notifications', profile?.id],
    queryFn: () => fetchNotifications(profile!.id),
    enabled: Boolean(profile?.id)
  });
}

/** Anything needing attention: failed imports and skipped rows. */
export function useUnreadCount(): number {
  const { data } = useNotifications();
  return (data ?? []).filter((n) => n.tone !== 'green').length;
}

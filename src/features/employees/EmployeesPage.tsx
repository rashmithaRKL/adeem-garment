import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { QueryState } from '@/components/QueryState';
import { formatDateTime } from '@/lib/format';
import { friendlyError } from '@/lib/errors';
import { useAuth } from '@/features/auth/AuthProvider';
import { fetchEmployees, setEmployeeRole, setEmployeeStatus } from './queries';

export function EmployeesPage() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { data, isLoading, error } = useQuery({ queryKey: ['employees'], queryFn: fetchEmployees });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['employees'] });

  const toggle = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'disabled' }) =>
      setEmployeeStatus(id, status),
    onSuccess: refresh
  });

  const changeRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: 'admin' | 'employee' }) =>
      setEmployeeRole(id, role),
    onSuccess: refresh
  });

  const busy = toggle.isPending || changeRole.isPending;

  return (
    <Card title="Employees" aside={<span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
      admin only · role changes are audited
    </span>}>
      {(toggle.error || changeRole.error) &&
        <p className="banner banner--error">{friendlyError(toggle.error ?? changeRole.error)}</p>}

      <QueryState isLoading={isLoading} error={error} isEmpty={data?.length === 0}
        emptyTitle="No employees yet"
        emptyBody="Accounts appear here as soon as someone signs up.">
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th><th>Employee ID</th><th>Email</th><th>Role</th>
                <th className="num">Uploads</th><th>Created</th><th>Status</th><th />
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((e) => (
                <tr key={e.id}>
                  <td style={{ fontWeight: 600 }}>{e.full_name}</td>
                  <td className="mono">{e.employee_id}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{e.email}</td>
                  <td>
                    <span className="chip" style={{
                      background: e.role === 'admin' ? 'var(--purple-50)' : 'var(--blue-50)',
                      color: e.role === 'admin' ? 'var(--purple-500)' : 'var(--blue-500)',
                      textTransform: 'capitalize'
                    }}>{e.role}</span>
                  </td>
                  <td className="num">{e.uploadCount}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{formatDateTime(e.created_at)}</td>
                  <td>
                    <span className="chip" style={{
                      background: e.status === 'active' ? 'var(--green-50)' : 'var(--surface-muted)',
                      color: e.status === 'active' ? 'var(--green-500)' : 'var(--text-muted)',
                      textTransform: 'capitalize'
                    }}>{e.status}</span>
                  </td>
                  <td className="num">
                    {/* An admin cannot demote or disable themselves — that is the
                        one move that can leave the factory with no way back in. */}
                    {e.id === profile?.id ? (
                      <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>You</span>
                    ) : (
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button type="button" className="btn btn--secondary btn--small"
                          disabled={busy}
                          onClick={() => changeRole.mutate({
                            id: e.id, role: e.role === 'admin' ? 'employee' : 'admin'
                          })}>
                          {e.role === 'admin' ? 'Make employee' : 'Make admin'}
                        </button>
                        <button type="button" className="btn btn--secondary btn--small"
                          disabled={busy}
                          onClick={() => toggle.mutate({
                            id: e.id, status: e.status === 'active' ? 'disabled' : 'active'
                          })}>
                          {e.status === 'active' ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </QueryState>
    </Card>
  );
}

import { useCallback, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { QueryState } from '@/components/QueryState';
import { Modal, Field } from '@/components/Modal';
import { SearchInput, useSearch, useSearchTerm } from '@/components/SearchInput';
import { formatDateTime } from '@/lib/format';
import { friendlyError } from '@/lib/errors';
import { useAuth } from '@/features/auth/AuthProvider';
import { ROLE_LABEL, type UserRole } from '@/types/domain';
import {
  fetchEmployees, setEmployeeRole, setEmployeeStatus,
  updateEmployee, deleteEmployee, createEmployeeAccount,
  type ProfileRow, type EmployeeEdit, type NewEmployee
} from './queries';

/** Most powerful first, so the list reads as a ladder rather than an alphabet. */
const ROLES: UserRole[] = ['admin', 'manager', 'employee'];

/** Purple is the administrator, amber the manager, blue the floor. */
const ROLE_TONE: Record<UserRole, { bg: string; fg: string }> = {
  admin:    { bg: 'var(--purple-50)', fg: 'var(--purple-500)' },
  manager:  { bg: 'var(--amber-50)',  fg: 'var(--amber-500)' },
  employee: { bg: 'var(--blue-50)',   fg: 'var(--blue-500)' }
};

export function EmployeesPage() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { data, isLoading, error } = useQuery({ queryKey: ['employees'], queryFn: fetchEmployees });

  const [term, setTerm] = useSearchTerm();
  const [editing, setEditing] = useState<ProfileRow | null>(null);
  const [removing, setRemoving] = useState<ProfileRow | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['employees'] });

  const toggle = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'disabled' }) =>
      setEmployeeStatus(id, status),
    onSuccess: refresh
  });
  const changeRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: UserRole }) =>
      setEmployeeRole(id, role),
    onSuccess: refresh
  });
  const save = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: EmployeeEdit }) => updateEmployee(id, patch),
    onSuccess: () => { refresh(); setEditing(null); }
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteEmployee(id),
    onSuccess: () => { refresh(); setRemoving(null); }
  });
  const create = useMutation({
    mutationFn: (input: NewEmployee) => createEmployeeAccount(input),
    // The dialog stays open on success to report whether a confirmation email
    // was sent — closing it would swallow the one thing the admin must act on.
    onSuccess: refresh
  });

  const rows = data ?? [];
  const searchable = useCallback(
    (e: ProfileRow) => `${e.full_name} ${e.employee_id} ${e.email} ${e.role} ${e.status}`, []
  );
  const shown = useSearch(rows, term, searchable);
  const busy = toggle.isPending || changeRole.isPending || save.isPending || remove.isPending;
  const mutationError = toggle.error ?? changeRole.error ?? remove.error;

  return (
    <>
      <Card
        title="Employees"
        aside={
          <button type="button" className="btn btn--primary btn--small" onClick={() => setShowHelp(true)}>
            Add employee
          </button>
        }
      >
        {mutationError && <p className="banner banner--error">{friendlyError(mutationError)}</p>}

        <SearchInput
          value={term}
          onChange={setTerm}
          placeholder="Search name, employee ID, email or role"
          count={{ shown: shown.length, total: rows.length }}
        />

        <QueryState isLoading={isLoading} error={error} isEmpty={rows.length === 0}
          emptyTitle="No employees yet"
          emptyBody="Accounts appear here as soon as someone signs up.">
          {shown.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-muted)' }}>
              Nothing matches “{term}”.
            </p>
          ) : (
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th><th>Employee ID</th><th>Email</th><th>Role</th>
                    <th className="num">Uploads</th><th>Created</th><th>Status</th><th />
                  </tr>
                </thead>
                <tbody>
                  {shown.map((e) => (
                    <tr key={e.id}>
                      <td style={{ fontWeight: 600 }}>{e.full_name}</td>
                      <td className="mono">{e.employee_id}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{e.email}</td>
                      <td>
                        <span className="chip" style={{
                          background: ROLE_TONE[e.role].bg,
                          color: ROLE_TONE[e.role].fg
                        }}>{ROLE_LABEL[e.role]}</span>
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
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                          <button type="button" className="btn btn--secondary btn--small"
                            disabled={busy} onClick={() => setEditing(e)}>
                            Edit
                          </button>
                          {/* An admin cannot demote, disable or delete themselves —
                              that is the one move that can leave the factory with no
                              way back in. */}
                          {e.id === profile?.id ? (
                            <span style={{ fontSize: 11.5, color: 'var(--text-faint)', alignSelf: 'center' }}>You</span>
                          ) : (
                            <>
                              {/* A picker rather than a toggle: with three roles
                                  there is no single "the other one" to flip to. */}
                              <select
                                className="input"
                                style={{ width: 'auto', padding: '6px 8px', fontSize: 12 }}
                                aria-label={`Role for ${e.full_name}`}
                                value={e.role}
                                disabled={busy}
                                onChange={(ev) => changeRole.mutate({
                                  id: e.id, role: ev.target.value as UserRole
                                })}>
                                {ROLES.map((r) => (
                                  <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                                ))}
                              </select>
                              <button type="button" className="btn btn--secondary btn--small"
                                disabled={busy}
                                onClick={() => toggle.mutate({
                                  id: e.id, status: e.status === 'active' ? 'disabled' : 'active'
                                })}>
                                {e.status === 'active' ? 'Deactivate' : 'Activate'}
                              </button>
                              <button type="button" className="btn btn--ghost btn--small"
                                disabled={busy} onClick={() => setRemoving(e)}
                                style={{ color: 'var(--red-500)' }}>
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </QueryState>
      </Card>

      {editing && (
        <EditEmployee
          employee={editing}
          isSelf={editing.id === profile?.id}
          saving={save.isPending}
          error={save.error ? friendlyError(save.error) : undefined}
          onCancel={() => { save.reset(); setEditing(null); }}
          onSave={(patch) => save.mutate({ id: editing.id, patch })}
        />
      )}

      {removing && (
        <Modal
          title="Delete employee"
          onClose={() => { remove.reset(); setRemoving(null); }}
          error={remove.error ? friendlyError(remove.error) : undefined}
          actions={
            <>
              <button type="button" className="btn btn--secondary"
                onClick={() => { remove.reset(); setRemoving(null); }}>Cancel</button>
              <button type="button" className="btn btn--danger"
                disabled={remove.isPending} onClick={() => remove.mutate(removing.id)}>
                {remove.isPending ? 'Deleting…' : 'Delete profile'}
              </button>
            </>
          }
        >
          <p style={{ margin: '0 0 12px', fontSize: 14 }}>
            Delete the profile for <strong>{removing.full_name}</strong> ({removing.email})?
          </p>
          <p className="banner banner--warning" style={{ margin: 0 }}>
            This removes their profile and every upload record attached to it. Their
            login is <strong>not</strong> removed — deleting that requires the Supabase
            dashboard — so they could still sign in and would land on an error screen.
            <br /><br />
            <strong>Deactivating is usually what you want:</strong> it blocks access
            immediately, keeps their history intact, and can be undone.
          </p>
        </Modal>
      )}

      {showHelp && (
        <AddEmployee
          creating={create.isPending}
          error={create.error ? friendlyError(create.error) : undefined}
          result={create.data ?? null}
          onCancel={() => { create.reset(); setShowHelp(false); }}
          onCreate={(input) => create.mutate(input)}
        />
      )}
    </>
  );
}

function AddEmployee({ creating, error, result, onCancel, onCreate }: {
  creating: boolean;
  error?: string | undefined;
  result: { needsConfirmation: boolean } | null;
  onCancel: () => void;
  onCreate: (input: NewEmployee) => void;
}) {
  const [form, setForm] = useState<NewEmployee>({
    email: '', password: '', fullName: '', employeeId: ''
  });
  const set = <K extends keyof NewEmployee>(k: K, v: NewEmployee[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const valid = /\S+@\S+\.\S+/.test(form.email)
    && form.password.length >= 6
    && form.fullName.trim().length > 0;

  if (result) {
    return (
      <Modal title="Employee created" onClose={onCancel}
        actions={<button type="button" className="btn btn--primary" onClick={onCancel}>Done</button>}>
        <p style={{ margin: '0 0 12px', fontSize: 14 }}>
          <strong>{form.fullName}</strong> now has an account and appears in the list as
          an active employee.
        </p>
        {result.needsConfirmation ? (
          <p className="banner banner--warning" style={{ margin: 0 }}>
            <strong>They cannot sign in yet.</strong> This project requires email
            confirmation, so Supabase has sent a link to {form.email}. They must click
            it before the password works. If it never arrives, confirm them by hand
            under Authentication → Users in the Supabase dashboard.
          </p>
        ) : (
          <p className="banner banner--info" style={{ margin: 0 }}>
            They can sign in immediately with the password you set.
          </p>
        )}
      </Modal>
    );
  }

  return (
    <Modal
      title="Add employee"
      onClose={onCancel}
      error={error}
      actions={
        <>
          <button type="button" className="btn btn--secondary" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn btn--primary" disabled={!valid || creating}
            onClick={() => onCreate(form)}>
            {creating ? 'Creating…' : 'Create employee'}
          </button>
        </>
      }
    >
      <Field label="Full name">
        <input className="input" value={form.fullName} autoComplete="off"
          onChange={(e) => set('fullName', e.target.value)} />
      </Field>

      <Field label="Email" hint="This is the address they sign in with. It cannot be changed here later.">
        <input className="input" type="email" value={form.email} autoComplete="off"
          onChange={(e) => set('email', e.target.value)} />
      </Field>

      <Field label="Password" hint="At least 6 characters. Tell them to change it after their first sign-in.">
        <input className="input" type="text" value={form.password} autoComplete="new-password"
          onChange={(e) => set('password', e.target.value)} />
      </Field>

      <Field label="Employee ID" hint="Optional — one is generated if you leave this blank.">
        <input className="input mono" value={form.employeeId} autoComplete="off"
          onChange={(e) => set('employeeId', e.target.value)} placeholder="EMP-0142" />
      </Field>

      <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-faint)', lineHeight: 1.6 }}>
        The account is created as an <strong>employee</strong>. Promote them to
        manager or admin from the list afterwards — a new account can never be given
        either at creation, so a mistake here cannot hand out the keys.
      </p>
    </Modal>
  );
}

function EditEmployee({ employee, isSelf, saving, error, onCancel, onSave }: {
  employee: ProfileRow;
  isSelf: boolean;
  saving: boolean;
  error?: string | undefined;
  onCancel: () => void;
  onSave: (patch: EmployeeEdit) => void;
}) {
  const [form, setForm] = useState<EmployeeEdit>({
    full_name: employee.full_name,
    employee_id: employee.employee_id,
    role: employee.role,
    status: employee.status
  });

  const set = <K extends keyof EmployeeEdit>(key: K, value: EmployeeEdit[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const valid = form.full_name.trim().length > 0 && form.employee_id.trim().length > 0;

  return (
    <Modal
      title={`Edit ${employee.full_name}`}
      onClose={onCancel}
      error={error}
      actions={
        <>
          <button type="button" className="btn btn--secondary" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn btn--primary" disabled={!valid || saving}
            onClick={() => onSave(form)}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </>
      }
    >
      <Field label="Full name">
        <input className="input" value={form.full_name}
          onChange={(e) => set('full_name', e.target.value)} />
      </Field>

      <Field label="Employee ID" hint="Must be unique across the factory.">
        <input className="input mono" value={form.employee_id}
          onChange={(e) => set('employee_id', e.target.value)} />
      </Field>

      <Field label="Email" hint="Changing a sign-in email requires the Supabase dashboard, so it is read-only here.">
        <input className="input" value={employee.email} readOnly disabled />
      </Field>

      <Field label="Role">
        <select className="input" value={form.role} disabled={isSelf}
          onChange={(e) => set('role', e.target.value as UserRole)}>
          {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
      </Field>

      <Field label="Status">
        <select className="input" value={form.status} disabled={isSelf}
          onChange={(e) => set('status', e.target.value as 'active' | 'disabled')}>
          <option value="active">Active</option>
          <option value="disabled">Disabled</option>
        </select>
      </Field>

      {isSelf && (
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-faint)' }}>
          Your own role and status are locked. Removing your own admin rights could
          leave the system with no administrator.
        </p>
      )}
    </Modal>
  );
}

import { AppShell, type NavItem } from './AppShell';

const items: NavItem[] = [
  { to: '/admin/dashboard',  label: 'Dashboard',        icon: '🏠' },
  { to: '/admin/lines',      label: 'Production Lines', icon: '🏭' },
  { to: '/admin/orders',     label: 'Orders',           icon: '📋' },
  { to: '/admin/analytics',  label: 'Analytics',        icon: '📊' },
  { to: '/admin/uploads',    label: 'Excel Uploads',    icon: '📁' },
  { to: '/admin/history',    label: 'Upload History',   icon: '🕐' },
  { to: '/admin/employees',  label: 'Employees',        icon: '👥' },
  { to: '/admin/audit-logs', label: 'Audit Logs',       icon: '🛡️' },
  { to: '/admin/settings',   label: 'Settings',         icon: '⚙️' }
];

const titles = {
  '/admin/dashboard':  { title: 'Production Dashboard', sub: 'Every active line, today' },
  '/admin/lines':      { title: 'Production Lines',     sub: 'Live target versus actual' },
  '/admin/orders':     { title: 'Orders',               sub: 'Quantities and delivery status' },
  '/admin/analytics':  { title: 'Analytics',            sub: 'Efficiency, buyer mix and trend' },
  '/admin/uploads':    { title: 'Excel Uploads',        sub: 'Private bucket, originals preserved' },
  '/admin/history':    { title: 'Upload History',       sub: 'Every version is retained' },
  '/admin/employees':  { title: 'Employees',            sub: 'Admin only — profiles and roles' },
  '/admin/audit-logs': { title: 'Audit Logs',           sub: 'Admin only — security events' },
  '/admin/settings':   { title: 'Settings',             sub: 'System configuration' }
};

export function AdminLayout() {
  return <AppShell group="Administration" items={items} titles={titles} />;
}

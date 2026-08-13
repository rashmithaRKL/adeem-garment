import { AppShell, type NavSection } from './AppShell';

/**
 * Two groups, and the split is deliberate. "Administration" is the six screens
 * the factory is actually run from — the list the client specified, in their
 * order. Everything underneath it is plumbing: getting data in, and managing who
 * may see it. Mixing the two is what made the old rail a wall of ten links with
 * no shape to it.
 */
const sections: NavSection[] = [
  {
    group: 'Administration',
    items: [
      { to: '/admin/dashboard',    label: 'Dashboard',          icon: '🏠' },
      { to: '/admin/quality',      label: 'Quality Management', icon: '🔍' },
      { to: '/admin/lines',        label: 'Production Line',    icon: '🏭' },
      { to: '/admin/hr',           label: 'HR',                 icon: '👥' },
      { to: '/admin/loading-plan', label: 'Loading Plan',       icon: '🗓️' },
      { to: '/admin/analytics',    label: 'Analytics',          icon: '📊' }
    ]
  },
  {
    group: 'Data & system',
    items: [
      { to: '/admin/orders',     label: 'Orders',         icon: '📋' },
      { to: '/admin/upload',     label: 'Upload Excel',   icon: '📤' },
      { to: '/admin/uploads',    label: 'Excel Uploads',  icon: '📁' },
      { to: '/admin/history',    label: 'Upload History', icon: '🕐' },
      { to: '/admin/employees',  label: 'Employees',      icon: '🪪' },
      { to: '/admin/audit-logs', label: 'Audit Logs',     icon: '🛡️' },
      { to: '/admin/settings',   label: 'Settings',       icon: '⚙️' }
    ]
  }
];

const titles = {
  '/admin/dashboard':    { title: 'Total Summary',        sub: 'Production, quality, manpower and loading at a glance' },
  '/admin/quality':      { title: 'Quality Management',   sub: 'Daily and monthly, line by line' },
  '/admin/lines':        { title: 'Production Line',      sub: 'Live target versus actual, current and next style' },
  '/admin/hr':           { title: 'HR',                   sub: 'Direct and indirect carder, absenteeism' },
  '/admin/loading-plan': { title: 'Loading Plan',         sub: 'Line-wise upcoming styles and their dates' },
  '/admin/analytics':    { title: 'Analytics',            sub: 'Efficiency, buyer mix and trend' },
  '/admin/orders':       { title: 'Orders',               sub: 'Quantities and delivery status' },
  '/admin/upload':       { title: 'Upload Excel',         sub: 'Scan, validate, preview, import' },
  '/admin/uploads':      { title: 'Excel Uploads',        sub: 'Private bucket, originals preserved' },
  '/admin/history':      { title: 'Upload History',       sub: 'Every version is retained' },
  '/admin/employees':    { title: 'Employees',            sub: 'Admin only — profiles and roles' },
  '/admin/audit-logs':   { title: 'Audit Logs',           sub: 'Admin only — security events' },
  '/admin/settings':     { title: 'Settings',             sub: 'System configuration' }
};

export function AdminLayout() {
  return <AppShell sections={sections} titles={titles} />;
}

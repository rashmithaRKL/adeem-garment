import { AppShell, type NavItem } from './AppShell';
import { useUnreadCount } from '@/features/notifications/queries';

const titles = {
  '/employee/dashboard':     { title: 'My Dashboard',       sub: 'Your line, this shift' },
  '/employee/upload':        { title: 'Upload Excel',       sub: 'Scan, validate, preview, import' },
  '/employee/history':       { title: 'My Upload History',  sub: 'Every version you created' },
  '/employee/notifications': { title: 'Notifications',      sub: 'Requests and import results' },
  '/employee/production':    { title: 'Production',         sub: 'Lines you are assigned to' },
  '/employee/profile':       { title: 'My Profile',         sub: 'Account and access details' }
};

export function EmployeeLayout() {
  const unread = useUnreadCount();

  const items: NavItem[] = [
    { to: '/employee/dashboard',     label: 'Dashboard',         icon: '🏠' },
    { to: '/employee/upload',        label: 'Upload Excel',      icon: '📤' },
    { to: '/employee/history',       label: 'My Upload History', icon: '🕐' },
    { to: '/employee/notifications', label: 'Notifications',     icon: '🔔', badge: unread },
    { to: '/employee/production',    label: 'Production',        icon: '🏭' },
    { to: '/employee/profile',       label: 'My Profile',        icon: '👤' }
  ];

  return <AppShell group="Employee portal" items={items} titles={titles} />;
}

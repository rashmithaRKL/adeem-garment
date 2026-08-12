import { createBrowserRouter } from 'react-router-dom';
import { RequireAuth, RequireRole, RedirectByRole } from './guards';
import { AdminLayout } from '@/layouts/AdminLayout';
import { EmployeeLayout } from '@/layouts/EmployeeLayout';
import { LoginPage } from '@/features/auth/LoginPage';
import { UnauthorizedPage } from '@/features/auth/UnauthorizedPage';
import { NotFoundPage } from '@/components/NotFoundPage';

import { AdminDashboardPage } from '@/features/dashboard/AdminDashboardPage';
import { LinesPage } from '@/features/lines/LinesPage';
import { OrdersPage } from '@/features/orders/OrdersPage';
import { AnalyticsPage } from '@/features/analytics/AnalyticsPage';
import { UploadsPage } from '@/features/uploads/UploadsPage';
import { UploadHistoryPage } from '@/features/uploads/UploadHistoryPage';
import { UploadDetailPage } from '@/features/uploads/UploadDetailPage';
import { EmployeesPage } from '@/features/employees/EmployeesPage';
import { AuditLogPage } from '@/features/audit/AuditLogPage';
import { SettingsPage } from '@/features/settings/SettingsPage';

import { EmployeeDashboardPage } from '@/features/dashboard/EmployeeDashboardPage';
import { EmployeeProductionPage } from '@/features/lines/EmployeeProductionPage';
import { UploadExcelPage } from '@/features/excel/UploadExcelPage';
import { NotificationsPage } from '@/features/notifications/NotificationsPage';
import { ProfilePage } from '@/features/auth/ProfilePage';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/unauthorized', element: <UnauthorizedPage /> },
  {
    element: <RequireAuth />,
    children: [
      { path: '/', element: <RedirectByRole /> },
      {
        // Every /admin/* path passes through RequireRole before its layout mounts.
        element: <RequireRole role="admin" />,
        children: [{
          path: '/admin',
          element: <AdminLayout />,
          children: [
            { index: true, element: <AdminDashboardPage /> },
            { path: 'dashboard', element: <AdminDashboardPage /> },
            { path: 'lines', element: <LinesPage /> },
            { path: 'orders', element: <OrdersPage /> },
            { path: 'analytics', element: <AnalyticsPage /> },
            { path: 'uploads', element: <UploadsPage /> },
            { path: 'uploads/:uploadId', element: <UploadDetailPage /> },
            { path: 'history', element: <UploadHistoryPage /> },
            { path: 'employees', element: <EmployeesPage /> },
            { path: 'audit-logs', element: <AuditLogPage /> },
            { path: 'settings', element: <SettingsPage /> }
          ]
        }]
      },
      {
        element: <RequireRole role="employee" />,
        children: [{
          path: '/employee',
          element: <EmployeeLayout />,
          children: [
            { index: true, element: <EmployeeDashboardPage /> },
            { path: 'dashboard', element: <EmployeeDashboardPage /> },
            { path: 'upload', element: <UploadExcelPage /> },
            { path: 'history', element: <UploadHistoryPage /> },
            { path: 'history/:uploadId', element: <UploadDetailPage /> },
            { path: 'notifications', element: <NotificationsPage /> },
            { path: 'production', element: <EmployeeProductionPage /> },
            { path: 'profile', element: <ProfilePage /> }
          ]
        }]
      }
    ]
  },
  { path: '*', element: <NotFoundPage /> }
]);

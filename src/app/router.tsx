import { createBrowserRouter } from 'react-router-dom';
import { RequireAuth, RequireRole, RedirectByRole } from './guards';
import { MANAGEMENT_ROLES } from '@/types/domain';
import { AdminLayout } from '@/layouts/AdminLayout';
import { EmployeeLayout } from '@/layouts/EmployeeLayout';
import { LoginPage } from '@/features/auth/LoginPage';
import { UnauthorizedPage } from '@/features/auth/UnauthorizedPage';
import { NotFoundPage } from '@/components/NotFoundPage';

import { AdminDashboardPage } from '@/features/dashboard/AdminDashboardPage';
import { LinesPage } from '@/features/lines/LinesPage';
import { OrdersPage } from '@/features/orders/OrdersPage';
import { AnalyticsPage } from '@/features/analytics/AnalyticsPage';
import { QualityManagementPage } from '@/features/quality/QualityManagementPage';
import { HRPage } from '@/features/hr/HRPage';
import { LoadingPlanPage } from '@/features/loading/LoadingPlanPage';
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
        // The management side is two roles wide and they see the same screens:
        // admin and manager differ only in what the Quality page shows them.
        element: <RequireRole role={MANAGEMENT_ROLES} />,
        children: [{
          path: '/admin',
          element: <AdminLayout />,
          children: [
            { index: true, element: <AdminDashboardPage /> },
            { path: 'dashboard', element: <AdminDashboardPage /> },
            { path: 'quality', element: <QualityManagementPage /> },
            { path: 'lines', element: <LinesPage /> },
            { path: 'hr', element: <HRPage /> },
            { path: 'loading-plan', element: <LoadingPlanPage /> },
            { path: 'orders', element: <OrdersPage /> },
            { path: 'analytics', element: <AnalyticsPage /> },
            { path: 'upload', element: <UploadExcelPage /> },
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

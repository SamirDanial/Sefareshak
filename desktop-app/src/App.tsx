import { SignedIn, SignedOut, SignInButton } from '@clerk/clerk-react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { PermissionProvider } from './contexts/PermissionContext';
import { usePermissions } from './contexts/PermissionContext';
import AdminGuard from './components/AdminGuard';
import AdminLayout from './components/AdminLayout';
import Dashboard from './pages/Dashboard';
import UsersManagement from './pages/UsersManagement';
import OrdersManagement from './pages/OrdersManagement';
import MealManagement from './pages/MealManagement';
import MenuCategories from './pages/MenuCategories';
import FeaturedMealsOrdering from './pages/FeaturedMealsOrdering';
import CategoryMealOrdering from './pages/CategoryMealOrdering';
import CategoryManagement from './pages/CategoryManagement';
import AddonManagement from './pages/AddonManagement';
import DeclarationManagement from './pages/DeclarationManagement';
import OptionalIngredientsManagement from './pages/OptionalIngredientsManagement';
import HeroSectionManagement from './pages/HeroSectionManagement';
import RevenueAnalytics from './pages/RevenueAnalytics';
import CategoryInsights from './pages/CategoryInsights';
import SettingsModern from './pages/SettingsModern.tsx';
import PushNotifications from './pages/PushNotifications';
import TermsAndPolicies from './pages/TermsAndPolicies';
import PolicyForm from './pages/PolicyForm';
import ReservationsManagement from './pages/ReservationsManagement';
import DealManagement from './pages/DealManagement';
import DealCategoryOrdering from './pages/DealCategoryOrdering';
import CategoryDealOrdering from './pages/CategoryDealOrdering';
import CategoryOrdering from './pages/CategoryOrdering';
import TableManagement from './pages/TableManagement';
import ReservationSettings from './pages/ReservationSettings';
import ZoneManagement from './pages/ZoneManagement';
import TableStatusGrid from './pages/TableStatusGrid';
import StaffManagement from './pages/StaffManagement';
import MyStaff from './pages/MyStaff';
import RoleManagement from './pages/RoleManagement';
import BranchManagement from './pages/BranchManagement';
import BranchForm from './pages/BranchForm';
import BranchReservationSettings from './pages/BranchReservationSettings';
import BusinessDay from './pages/BusinessDay';
import BusinessDayClosedDays from './pages/BusinessDayClosedDays';
import BusinessDayClosedDayDetails from './pages/BusinessDayClosedDayDetails';
import DeliverableQuantities from './pages/DeliverableQuantities';
import ReservationAnalytics from './pages/ReservationAnalytics';
import OrganizationsManagement from './pages/OrganizationsManagement';
import AuditLogs from './pages/AuditLogs';
import KitchenWindow from './pages/KitchenWindow';
import BarWindow from './pages/BarWindow';
import DispatchWindow from './pages/DispatchWindow';
import { ToastContainer, toast, useToast } from './components/Toast';
import { audioService } from './services/audioService';
import { useEffect } from 'react';

declare global {
  interface Window {
    electronAPI?: {
      platform: string;
      versions: {
        node: string;
        chrome: string;
        electron: string;
      };
      playNotificationSound?: (type: 'newOrder' | 'statusChange') => Promise<boolean>;
      setBadgeCount?: (count: number) => Promise<boolean>;
      onOAuthCallback?: (callback: (url: string) => void) => () => void;
      clearAuthSession?: () => Promise<boolean>;
      restartApp?: () => Promise<boolean>;
      openKitchenWindow?: (options?: { branchId?: string }) => Promise<boolean>;
      openBarWindow?: (options?: { branchId?: string }) => Promise<boolean>;
      openDispatchWindow?: (options?: { branchId?: string }) => Promise<boolean>;
    };
  }
}

function RequireSuperAdmin({ children }: { children: React.ReactNode }) {
  const { isSuperAdmin } = usePermissions();
  if (!isSuperAdmin) return <Navigate to="/admin" replace />;
  return <>{children}</>;
}

function RequireReservationsEntitled({ children }: { children: React.ReactNode }) {
  const { rbacUser, isSuperAdmin } = usePermissions();
  const { userType } = useAuth();

  const reservationEntitled =
    isSuperAdmin || userType === "SUPER_ADMIN"
      ? true
      : (rbacUser as any)?.organizationEntitlements?.reservationsAllowed !== false;

  if (!reservationEntitled) return <Navigate to="/admin" replace />;
  return <>{children}</>;
}

function RequireBranchAdmin({ children }: { children: React.ReactNode }) {
  const { userType } = useAuth();
  if (userType !== "BRANCH_ADMIN") return <Navigate to="/admin" replace />;
  return <>{children}</>;
}

function AppContent() {
  const { toasts, removeToast } = useToast();
  const { isSignedIn, isLoading } = useAuth();

  const clearLocalData = async () => {
    try {
      try {
        if (window.electronAPI?.clearAuthSession) {
          await window.electronAPI.clearAuthSession();
        }
      } catch {
        // ignore
      }

      try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < window.localStorage.length; i += 1) {
          const k = window.localStorage.key(i);
          if (!k) continue;
          const kk = k.toLowerCase();
          if (kk.startsWith('__clerk') || kk.includes('clerk')) continue;
          keysToRemove.push(k);
        }
        keysToRemove.forEach((k) => window.localStorage.removeItem(k));
      } catch {
        // ignore
      }

      try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < window.sessionStorage.length; i += 1) {
          const k = window.sessionStorage.key(i);
          if (!k) continue;
          const kk = k.toLowerCase();
          if (kk.startsWith('__clerk') || kk.includes('clerk')) continue;
          keysToRemove.push(k);
        }
        keysToRemove.forEach((k) => window.sessionStorage.removeItem(k));
      } catch {
        // ignore
      }

      try {
        if ('caches' in window) {
          const names = await caches.keys();
          await Promise.all(names.map((n) => caches.delete(n)));
        }
      } catch {
        // ignore
      }

      try {
        const anyIndexedDB: any = indexedDB as any;
        if (typeof anyIndexedDB?.databases === 'function') {
          const dbs = await anyIndexedDB.databases();
          await Promise.all(
            (dbs || [])
              .map((d: any) => d?.name)
              .filter(Boolean)
              .map(
                (name: string) =>
                  new Promise<void>((resolve) => {
                    try {
                      const req = indexedDB.deleteDatabase(name);
                      req.onsuccess = () => resolve();
                      req.onerror = () => resolve();
                      req.onblocked = () => resolve();
                    } catch {
                      resolve();
                    }
                  })
              )
          );
        }
      } catch {
        // ignore
      }

      try {
        const cookies = document.cookie ? document.cookie.split(';') : [];
        for (const cookie of cookies) {
          const eqPos = cookie.indexOf('=');
          const name = (eqPos > -1 ? cookie.slice(0, eqPos) : cookie).trim();
          if (!name) continue;

          const lowerName = name.toLowerCase();
          if (lowerName.startsWith('__clerk') || lowerName.includes('clerk')) continue;

          document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
        }
      } catch {
        // ignore
      }

      toast.success('Local data cleared. Reloading…');
      try {
        if (window.electronAPI?.restartApp) {
          await window.electronAPI.restartApp();
          return;
        }
      } catch {
        // ignore
      }

      try {
        window.location.reload();
      } catch {
        // ignore
      }
    } catch {
      toast.error('Failed to clear local data. Please restart the app and try again.');
    }
  };

  // Initialize audio service early in app lifecycle
  useEffect(() => {
    audioService.init();
  }, []);

  // If auth is still loading, show loading state
  if (isLoading) {
    return (
      <div style={{ 
        fontFamily: 'system-ui, -apple-system, sans-serif',
        height: '100vh',
        width: '100vw',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f9fafb'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⏳</div>
          <p style={{ color: '#6b7280' }}>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
      fontFamily: 'system-ui, -apple-system, sans-serif',
      height: '100vh',
      width: '100vw',
      overflow: 'hidden'
    }}>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      {!isSignedIn ? (
        <div style={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f9fafb',
          padding: '2rem'
        }}>
          <div style={{
            textAlign: 'center',
            padding: '4rem 2rem',
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            maxWidth: '500px',
            width: '100%'
          }}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🔐</div>
            <h2 style={{ fontSize: '1.75rem', fontWeight: 'bold', marginBottom: '1rem', color: '#111827' }}>
              Sign In Required
            </h2>
            <p style={{ color: '#6b7280', marginBottom: '2rem', fontSize: '1.1rem' }}>
              Please sign in with your Clerk account to access the Bellami Desktop Admin Dashboard.
              <br />
              <strong>Only administrators can access this application.</strong>
            </p>
            <SignedOut>
              <SignInButton mode="modal">
                <button style={{
                  padding: '0.875rem 2rem',
                  fontSize: '1.1rem',
                  cursor: 'pointer',
                  backgroundColor: '#ec4899',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  fontWeight: '600',
                  boxShadow: '0 4px 6px rgba(236, 72, 153, 0.3)',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor = '#db2777';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 8px rgba(236, 72, 153, 0.4)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = '#ec4899';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 6px rgba(236, 72, 153, 0.3)';
                }}
                >
                  Sign In to Continue
                </button>
              </SignInButton>
            </SignedOut>

            <div style={{ marginTop: '1rem' }}>
              <button
                type="button"
                onClick={clearLocalData}
                style={{
                  padding: '0.6rem 1.25rem',
                  fontSize: '0.95rem',
                  cursor: 'pointer',
                  backgroundColor: '#111827',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  fontWeight: '600',
                  opacity: 0.9,
                }}
              >
                Clear local data
              </button>
            </div>
          </div>
        </div>
      ) : (
        <SignedIn>
          <PermissionProvider>
            <AdminGuard>
              <BrowserRouter>
                <Routes>
                  <Route path="/admin" element={<AdminLayout />}>
                    <Route index element={<Dashboard />} />
                    <Route path="users" element={<UsersManagement />} />
                    <Route path="orders" element={<OrdersManagement />} />
                    <Route path="menu" element={<MenuCategories />} />
                    <Route path="menu/:categoryId" element={<MealManagement />} />
                    <Route path="menu/:categoryId/order" element={<CategoryMealOrdering />} />
                    <Route path="menu/featured-ordering" element={<FeaturedMealsOrdering />} />
                    <Route path="categories" element={<CategoryManagement />} />
                    <Route path="categories/ordering" element={<CategoryOrdering />} />
                    <Route path="addons" element={<AddonManagement />} />
                    <Route path="declarations" element={<DeclarationManagement />} />
                    <Route path="optional-ingredients" element={<OptionalIngredientsManagement />} />
                    <Route path="hero-section" element={<HeroSectionManagement />} />
                    <Route path="analytics" element={<RevenueAnalytics />} />
                    <Route path="insights" element={<CategoryInsights />} />
                    <Route path="settings" element={<SettingsModern />} />

                    <Route
                      path="reservations"
                      element={
                        <RequireReservationsEntitled>
                          <ReservationsManagement />
                        </RequireReservationsEntitled>
                      }
                    />
                    <Route path="deals" element={<DealManagement />} />
                    <Route path="deals/categories/ordering" element={<DealCategoryOrdering />} />
                    <Route path="deals/categories/:categoryId/ordering" element={<CategoryDealOrdering />} />
                    <Route
                      path="reservations/tables"
                      element={
                        <RequireReservationsEntitled>
                          <TableManagement />
                        </RequireReservationsEntitled>
                      }
                    />
                    <Route
                      path="zones"
                      element={
                        <RequireReservationsEntitled>
                          <ZoneManagement />
                        </RequireReservationsEntitled>
                      }
                    />
                    <Route
                      path="reservations/tables/status-grid"
                      element={
                        <RequireReservationsEntitled>
                          <TableStatusGrid />
                        </RequireReservationsEntitled>
                      }
                    />
                    <Route
                      path="my-staff"
                      element={
                        <RequireBranchAdmin>
                          <MyStaff />
                        </RequireBranchAdmin>
                      }
                    />
                    <Route path="staff" element={<StaffManagement />} />
                    <Route path="roles" element={<RoleManagement />} />
                    <Route path="branches" element={<BranchManagement />} />
                    <Route path="branches/new" element={<BranchForm />} />
                    <Route path="branches/:id/edit" element={<BranchForm />} />
                    <Route
                      path="branches/:id/reservation-settings"
                      element={<BranchReservationSettings />}
                    />
                    <Route path="business-day" element={<BusinessDay />} />
                    <Route path="business-day/closed" element={<BusinessDayClosedDays />} />
                    <Route
                      path="business-day/closed/:sessionId"
                      element={<BusinessDayClosedDayDetails />}
                    />
                    <Route path="deliverable-quantities" element={<DeliverableQuantities />} />
                    <Route
                      path="reservations/analytics"
                      element={
                        <RequireReservationsEntitled>
                          <ReservationAnalytics />
                        </RequireReservationsEntitled>
                      }
                    />
                    <Route
                      path="organizations"
                      element={
                        <RequireSuperAdmin>
                          <OrganizationsManagement />
                        </RequireSuperAdmin>
                      }
                    />
                    <Route path="audit-logs" element={<AuditLogs />} />
                    <Route
                      path="reservations/settings"
                      element={
                        <RequireReservationsEntitled>
                          <ReservationSettings />
                        </RequireReservationsEntitled>
                      }
                    />
                    <Route
                      path="push-notifications"
                      element={
                        <RequireSuperAdmin>
                          <PushNotifications />
                        </RequireSuperAdmin>
                      }
                    />
                    <Route
                      path="terms-and-policies"
                      element={
                        <RequireSuperAdmin>
                          <TermsAndPolicies />
                        </RequireSuperAdmin>
                      }
                    />
                    <Route
                      path="terms-and-policies/form"
                      element={
                        <RequireSuperAdmin>
                          <PolicyForm />
                        </RequireSuperAdmin>
                      }
                    />
                  </Route>
                  <Route path="/kitchen" element={<KitchenWindow />} />
                  <Route path="/bar" element={<BarWindow />} />
                  <Route path="/dispatch" element={<DispatchWindow />} />
                  <Route path="/" element={<Navigate to="/admin" replace />} />
                </Routes>
              </BrowserRouter>
            </AdminGuard>
          </PermissionProvider>
        </SignedIn>
      )}
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;


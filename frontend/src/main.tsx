import { StrictMode, lazy, Suspense, useEffect } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./i18n/config";
import App from "./App.tsx";
import { createBrowserRouter, RouterProvider, useNavigate, useRouteError } from "react-router-dom";
import { ClerkProvider } from "@clerk/clerk-react";
import { AuthProvider } from "./contexts/AuthContext";
import { PermissionProvider, RequirePermission, RequireAnyPermission } from "./contexts/PermissionContext";
import { RESOURCES, ACTIONS } from "./lib/permissions";
import { SettingsProvider } from "./contexts/SettingsContext";
import { BranchProvider, useBranch } from "./contexts/BranchContext";
import ProtectedRoute from "./components/ProtectedRoute.tsx";
import LoadingSpinner from "./components/LoadingSpinner.tsx";
import ErrorBoundary from "./components/ErrorBoundary.tsx";
import Icon from "@mdi/react";
import { mdiAlertCircle, mdiRefresh, mdiHome } from "@mdi/js";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const lazyWithRetry = <T extends { default: any }>(
  factory: () => Promise<T>
) =>
  lazy(() =>
    factory().catch((error: any) => {
      const message =
        (typeof error?.message === "string" && error.message) ||
        (typeof error === "string" ? error : "");

      const isChunkLoadFailure =
        typeof message === "string" &&
        (message.includes("Failed to fetch dynamically imported module") ||
          message.includes("Importing a module script failed") ||
          message.includes("ChunkLoadError"));

      if (isChunkLoadFailure) {
        try {
          const key = "bellami:chunk_load_retry";
          const alreadyRetried = window.sessionStorage.getItem(key) === "1";
          if (!alreadyRetried) {
            window.sessionStorage.setItem(key, "1");
            window.location.reload();
            return new Promise<T>(() => {
              // keep pending; page reload will interrupt
            });
          }
        } catch {
          // ignore
        }
      }

      throw error;
    })
  );

// Lazy load all pages
const Home = lazy(() => import("./pages/Home.tsx"));
const Menu = lazy(() => import("./pages/Menu.tsx"));
const Categories = lazy(() => import("./pages/Categories.tsx"));
const DealCategories = lazy(() => import("./pages/DealCategories.tsx"));
const Cart = lazy(() => import("./pages/Cart.tsx"));
const Checkout = lazy(() => import("./pages/Checkout.tsx"));
const ReservationCheckout = lazy(() => import("./pages/ReservationCheckout.tsx"));
const ModifyReservation = lazy(() => import("./pages/ModifyReservation.tsx"));
const Orders = lazy(() => import("./pages/Orders.tsx"));
const Favorites = lazy(() => import("./pages/Favorites.tsx"));
const OrderConfirmation = lazy(() => import("./pages/OrderConfirmation.tsx"));
const CategoryPage = lazy(() => import("./pages/CategoryPage.tsx"));
const DealCategoryPage = lazy(() => import("./pages/DealCategoryPage.tsx"));
const MealCustomization = lazy(() => import("./pages/MealCustomization.tsx"));
const DealCustomization = lazy(() => import("./pages/DealCustomization.tsx"));
const Profile = lazy(() => import("./pages/Profile.tsx"));
const Admin = lazy(() => import("./pages/Admin.tsx"));
const AdminLayout = lazyWithRetry(() => import("./components/admin/AdminLayout.tsx"));
const CategoryInsights = lazy(() => import("./pages/CategoryInsights.tsx"));
const CategoryManagement = lazy(() => import("./pages/CategoryManagement.tsx"));
const CategoryOrdering = lazy(() => import("./pages/CategoryOrdering.tsx"));
const AuditLogs = lazy(() => import("./pages/admin/AuditLogs.tsx"));
const CategoryMealOrdering = lazy(
  () => import("./pages/CategoryMealOrdering.tsx")
);
const DealCategoryOrdering = lazy(
  () => import("./pages/DealCategoryOrdering.tsx")
);
const CategoryDealOrdering = lazy(
  () => import("./pages/CategoryDealOrdering.tsx")
);
const AddonManagement = lazy(() => import("./pages/AddonManagement.tsx"));
const DeclarationManagement = lazy(
  () => import("./pages/DeclarationManagement.tsx")
);
const OptionalIngredientsManagement = lazy(
  () => import("./pages/OptionalIngredientsManagement.tsx")
);
const ReservationSettings = lazy(
  () => import("./pages/admin/ReservationSettings.tsx")
);
const ReservationManagement = lazy(
  () => import("./pages/admin/ReservationManagement.tsx")
);
const TableManagement = lazy(
  () => import("./pages/admin/TableManagement.tsx")
);
const ZoneManagement = lazy(
  () => import("./pages/admin/ZoneManagement.tsx")
);
const TableStatusGrid = lazy(
  () => import("./pages/admin/TableStatusGrid.tsx")
);
const ReservationAnalytics = lazy(
  () => import("./pages/admin/ReservationAnalytics.tsx")
);
const MenuCategories = lazy(() => import("./pages/MenuCategories.tsx"));
const MealManagement = lazy(() => import("./pages/MealManagement.tsx"));
const FeaturedMealsOrdering = lazy(
  () => import("./pages/FeaturedMealsOrdering.tsx")
);
const DealManagement = lazy(() => import("./pages/DealManagement.tsx"));
const UsersManagement = lazy(() => import("./pages/UsersManagement.tsx"));
const StaffManagement = lazy(() => import("./pages/admin/StaffManagement"));
const MyStaff = lazy(() => import("./pages/admin/MyStaff"));
const RoleManagement = lazy(() => import("./pages/admin/RoleManagement.tsx"));
const OrderManagement = lazy(() => import("./pages/OrderManagement.tsx"));
const RevenueAnalytics = lazy(() => import("./pages/RevenueAnalytics.tsx"));
const Settings = lazy(() => import("./pages/Settings.tsx"));
const PushNotifications = lazy(
  () => import("./pages/admin/PushNotifications.tsx")
);
const PublicOrderDetails = lazy(() => import("./pages/PublicOrderDetails.tsx"));
const HeroSectionManagement = lazy(
  () => import("./pages/HeroSectionManagement.tsx")
);
const TermsAndPolicies = lazy(
  () => import("./pages/admin/TermsAndPolicies.tsx")
);
const PolicyForm = lazy(() => import("./pages/admin/PolicyForm.tsx"));
const OrganizationsManagement = lazy(
  () => import("./pages/admin/OrganizationsManagement.tsx")
);
const TermsAndPoliciesViewer = lazy(
  () => import("./pages/TermsAndPolicies.tsx")
);
const ReservationBooking = lazy(
  () => import("./pages/ReservationBooking.tsx")
);
const MyReservations = lazy(
  () => import("./pages/MyReservations.tsx")
);
const ReservationConfirmation = lazy(
  () => import("./pages/ReservationConfirmation.tsx")
);
const BranchManagement = lazy(
  () => import("./pages/admin/BranchManagement.tsx")
);
const BranchCreate = lazy(
  () => import("./pages/admin/BranchCreate.tsx")
);
const BranchReservationSettings = lazy(
  () => import("./pages/admin/BranchReservationSettings.tsx")
);
const AdminSetup = lazy(() => import("./pages/admin/AdminSetup.tsx"));
const DeliverableQuantities = lazy(
  () => import("./pages/admin/DeliverableQuantities.tsx")
);
const BusinessDay = lazy(() =>
  import("./pages/admin/BusinessDay.tsx").then((m) => ({ default: m.default }))
);
const BusinessDayClosedDays = lazy(
  () => import("./pages/admin/BusinessDayClosedDays.tsx")
);
const BusinessDayClosedDayDetails = lazy(
  () => import("./pages/admin/BusinessDayClosedDayDetails.tsx")
);
const DeliveryAddress = lazy(() => import("./pages/DeliveryAddress.tsx"));
const CustomerScope = lazy(() => import("./pages/CustomerScope.tsx"));

// Get the publishable key from environment variables
const clerkPublishableKey = import.meta.env.VITE_PUBLIC_CLERK_PUBLISHABLE_KEY;

// Get the frontend domain/URL for Clerk redirects
// When served from backend, use current origin; otherwise use env variable
const frontendDomain =
  import.meta.env.VITE_FRONTEND_URL ||
  (typeof window !== "undefined" ? window.location.origin : "");

// Check if we have a valid Clerk key (not placeholder)
const isValidClerkKey =
  clerkPublishableKey &&
  clerkPublishableKey.startsWith("pk_") &&
  clerkPublishableKey !== "pk_test_your_publishable_key_here";

// Check if using development key in production
const isProduction =
  import.meta.env.PROD || import.meta.env.MODE === "production";
const isUsingDevKey =
  clerkPublishableKey && clerkPublishableKey.startsWith("pk_test_");

// Warn if using development key in production
if (isProduction && isUsingDevKey && isValidClerkKey) {
  console.warn(
    "⚠️ WARNING: You are using a Clerk development key (pk_test_*) in production. " +
      "Please switch to a production key (pk_live_*) for production deployments. " +
      "Get your production key from: https://dashboard.clerk.com/"
  );
}

// For development/testing - allow placeholder key but show warning
const isDevelopmentMode =
  clerkPublishableKey === "pk_test_your_publishable_key_here";

function RootRedirect() {
  const navigate = useNavigate();
  const { customerLocation } = useBranch();
  useEffect(() => {
    navigate(customerLocation ? "/home" : "/scope", { replace: true });
  }, [customerLocation, navigate]);
  return null;
}

const ErrorPage = () => {
  const error = useRouteError() as any;

  const errorMessage =
    (typeof error?.message === "string" && error.message) ||
    (typeof error === "string" ? error : "");

  const isDynamicImportFailure =
    typeof errorMessage === "string" &&
    (errorMessage.includes("Failed to fetch dynamically imported module") ||
      errorMessage.includes("Importing a module script failed") ||
      errorMessage.includes("ChunkLoadError"));

  const title = isDynamicImportFailure
    ? "Update needed"
    : "Page Not Found or Error Occurred";

  const description = isDynamicImportFailure
    ? "A new version of the app is available. Please refresh this page to continue."
    : "The page you're looking for doesn't exist or an error occurred while loading it.";

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl border-2 border-red-200 dark:border-red-800 shadow-xl">
        <CardHeader className="text-center pb-4">
          <div className="flex justify-center mb-4">
            <div className="rounded-full bg-red-100 dark:bg-red-900/30 p-4">
              <Icon path={mdiAlertCircle} size={2.0} className="text-red-600 dark:text-red-400" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold text-red-600 dark:text-red-400">
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="text-center space-y-2">
            <p className="text-gray-700 dark:text-gray-300 text-lg">{description}</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
            <Button
              onClick={() => window.location.reload()}
              className="bg-pink-500 hover:bg-pink-600 text-white"
              size="lg"
            >
              <Icon path={mdiRefresh} size={0.67} className="mr-2" />
              Refresh Page
            </Button>
            <Button
              onClick={() => (window.location.href = "/")}
              variant="outline"
              size="lg"
              className="border-pink-500 text-pink-500 hover:bg-pink-50 dark:hover:bg-pink-900/20"
            >
              <Icon path={mdiHome} size={0.67} className="mr-2" />
              Go to Home
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    errorElement: <ErrorPage />,
    children: [
      {
        index: true,
        element: <RootRedirect />,
      },
      {
        path: "home",
        element: (
          <Suspense
            fallback={<LoadingSpinner message="Loading home page..." />}
          >
            <Home />
          </Suspense>
        ),
      },
      {
        path: "menu",
        element: (
          <Suspense fallback={<LoadingSpinner message="Loading menu..." />}>
            <Menu />
          </Suspense>
        ),
      },
      {
        path: "categories",
        element: (
          <Suspense
            fallback={<LoadingSpinner message="Loading categories..." />}
          >
            <Categories />
          </Suspense>
        ),
      },
      {
        path: "deal-categories",
        element: (
          <Suspense
            fallback={<LoadingSpinner message="Loading deal categories..." />}
          >
            <DealCategories />
          </Suspense>
        ),
      },
      {
        path: "cart",
        element: (
          <Suspense fallback={<LoadingSpinner message="Loading cart..." />}>
            <Cart />
          </Suspense>
        ),
      },
      {
        path: "checkout",
        element: (
          <ProtectedRoute>
            <Suspense
              fallback={<LoadingSpinner message="Loading checkout..." />}
            >
              <Checkout />
            </Suspense>
          </ProtectedRoute>
        ),
      },
      {
        path: "order-confirmation",
        element: (
          <ProtectedRoute>
            <Suspense
              fallback={
                <LoadingSpinner message="Loading order confirmation..." />
              }
            >
              <OrderConfirmation />
            </Suspense>
          </ProtectedRoute>
        ),
      },
      {
        path: "orders",
        element: (
          <ProtectedRoute>
            <Suspense fallback={<LoadingSpinner message="Loading orders..." />}>
              <Orders />
            </Suspense>
          </ProtectedRoute>
        ),
      },
      {
        path: "favorites",
        element: (
          <ProtectedRoute>
            <Suspense fallback={<LoadingSpinner message="Loading favorites..." />}>
              <Favorites />
            </Suspense>
          </ProtectedRoute>
        ),
      },
      {
        path: "category/:categoryId",
        element: (
          <Suspense fallback={<LoadingSpinner message="Loading category..." />}>
            <CategoryPage />
          </Suspense>
        ),
      },
      {
        path: "deal-category/:categoryId",
        element: (
          <Suspense fallback={<LoadingSpinner message="Loading deal category..." />}>
            <DealCategoryPage />
          </Suspense>
        ),
      },
      {
        path: "meal/:mealId",
        element: (
          <Suspense
            fallback={<LoadingSpinner message="Loading meal details..." />}
          >
            <MealCustomization />
          </Suspense>
        ),
      },
      {
        path: "deal/:dealId",
        element: (
          <Suspense fallback={<LoadingSpinner message="Loading deal details..." />}>
            <DealCustomization />
          </Suspense>
        ),
      },
      {
        path: "profile",
        element: (
          <ProtectedRoute>
            <Suspense
              fallback={<LoadingSpinner message="Loading profile..." />}
            >
              <Profile />
            </Suspense>
          </ProtectedRoute>
        ),
      },
      {
        path: "reservations/book",
        element: (
          <Suspense
            fallback={<LoadingSpinner message="Loading reservation booking..." />}
          >
            <ReservationBooking />
          </Suspense>
        ),
      },
      {
        path: "reservations/checkout",
        element: (
          <ProtectedRoute>
            <Suspense
              fallback={<LoadingSpinner message="Loading checkout..." />}
            >
              <ReservationCheckout />
            </Suspense>
          </ProtectedRoute>
        ),
      },
      {
        path: "reservations/modify/:id",
        element: (
          <ProtectedRoute>
            <Suspense
              fallback={<LoadingSpinner message="Loading modification..." />}
            >
              <ModifyReservation />
            </Suspense>
          </ProtectedRoute>
        ),
      },
      {
        path: "reservations/my-reservations",
        element: (
          <ProtectedRoute>
            <Suspense
              fallback={<LoadingSpinner message="Loading reservations..." />}
            >
              <MyReservations />
            </Suspense>
          </ProtectedRoute>
        ),
      },
      {
        path: "reservations/confirmation/:id",
        element: (
          <ProtectedRoute>
            <Suspense
              fallback={<LoadingSpinner message="Loading confirmation..." />}
            >
              <ReservationConfirmation />
            </Suspense>
          </ProtectedRoute>
        ),
      },
      {
        path: "scope",
        element: (
          <Suspense
            fallback={<LoadingSpinner message="Loading..." />}
          >
            <CustomerScope />
          </Suspense>
        ),
      },
      {
        path: "delivery/:orderId",
        element: (
          <Suspense
            fallback={<LoadingSpinner message="Loading delivery details..." />}
          >
            <DeliveryAddress />
          </Suspense>
        ),
      },
      {
        path: "order/:orderId",
        element: (
          <Suspense
            fallback={<LoadingSpinner message="Loading order details..." />}
          >
            <PublicOrderDetails />
          </Suspense>
        ),
      },
    ],
  },
  {
    path: "/admin",
    element: (
      <ProtectedRoute requireStaff={true}>
        <Suspense
          fallback={<LoadingSpinner message="Loading admin panel..." />}
        >
          <AdminLayout />
        </Suspense>
      </ProtectedRoute>
    ),
    errorElement: <ErrorPage />,
    children: [
      {
        path: "setup",
        element: (
          <ProtectedRoute requireSuperAdmin={true} redirectTo="/admin">
            <Suspense fallback={<LoadingSpinner message="Loading setup..." />}>
              <AdminSetup />
            </Suspense>
          </ProtectedRoute>
        ),
      },
      {
        path: "organizations",
        element: (
          <ProtectedRoute requireSuperAdmin={true} redirectTo="/admin">
            <Suspense
              fallback={<LoadingSpinner message="Loading organizations..." />}
            >
              <OrganizationsManagement />
            </Suspense>
          </ProtectedRoute>
        ),
      },
      {
        index: true,
        element: (
          <RequirePermission resource={RESOURCES.DASHBOARD} action={ACTIONS.VIEW} redirectTo="/">
            <Suspense
              fallback={<LoadingSpinner message="Loading dashboard..." />}
            >
              <Admin />
            </Suspense>
          </RequirePermission>
        ),
      },
      {
        path: "users",
        element: (
          <ProtectedRoute requireSuperAdmin={true} redirectTo="/admin">
            <Suspense
              fallback={<LoadingSpinner message="Loading user management..." />}
            >
              <UsersManagement />
            </Suspense>
          </ProtectedRoute>
        ),
      },
      {
        path: "staff",
        element: (
          <ProtectedRoute requireStaff={true} redirectTo="/admin">
            <Suspense
              fallback={<LoadingSpinner message="Loading staff management..." />}
            >
              <StaffManagement />
            </Suspense>
          </ProtectedRoute>
        ),
      },
      {
        path: "audit-logs",
        element: (
          <ProtectedRoute requireStaff={true} redirectTo="/admin">
            <Suspense fallback={<LoadingSpinner message="Loading audit logs..." />}>
              <AuditLogs />
            </Suspense>
          </ProtectedRoute>
        ),
      },
      {
        path: "roles",
        element: (
          <ProtectedRoute requireStaff={true} redirectTo="/admin">
            <Suspense
              fallback={<LoadingSpinner message="Loading role management..." />}
            >
              <RoleManagement />
            </Suspense>
          </ProtectedRoute>
        ),
      },
      {
        path: "my-staff",
        element: (
          <ProtectedRoute requireBranchAdmin={true} redirectTo="/admin">
            <Suspense fallback={<LoadingSpinner message="Loading staff..." />}>
              <MyStaff />
            </Suspense>
          </ProtectedRoute>
        ),
      },
      {
        path: "orders",
        element: (
          <Suspense
            fallback={<LoadingSpinner message="Loading order management..." />}
          >
            <OrderManagement />
          </Suspense>
        ),
      },
      {
        path: "menu",
        element: (
          <Suspense
            fallback={
              <LoadingSpinner message="Loading menu categories..." />
            }
          >
            <MenuCategories />
          </Suspense>
        ),
      },
      {
        path: "menu/featured-ordering",
        element: (
          <Suspense
            fallback={
              <LoadingSpinner message="Loading featured meals ordering..." />
            }
          >
            <FeaturedMealsOrdering />
          </Suspense>
        ),
      },
      {
        path: "menu/:categoryId",
        element: (
          <Suspense
            fallback={<LoadingSpinner message="Loading meal management..." />}
          >
            <MealManagement />
          </Suspense>
        ),
      },
      {
        path: "menu/:categoryId/order",
        element: (
          <Suspense
            fallback={
              <LoadingSpinner message="Loading meal ordering interface..." />
            }
          >
            <CategoryMealOrdering />
          </Suspense>
        ),
      },
      {
        path: "deals",
        element: (
          <Suspense fallback={<LoadingSpinner message="Loading deals..." />}>
            <DealManagement />
          </Suspense>
        ),
      },
      {
        path: "categories",
        element: (
          <Suspense
            fallback={
              <LoadingSpinner message="Loading category management..." />
            }
          >
            <CategoryManagement />
          </Suspense>
        ),
      },
      {
        path: "categories/ordering",
        element: (
          <Suspense
            fallback={
              <LoadingSpinner message="Loading category ordering..." />
            }
          >
            <CategoryOrdering />
          </Suspense>
        ),
      },
      {
        path: "deals/categories/ordering",
        element: (
          <Suspense
            fallback={
              <LoadingSpinner message="Loading deal category ordering..." />
            }
          >
            <DealCategoryOrdering />
          </Suspense>
        ),
      },
      {
        path: "deals/categories/:categoryId/ordering",
        element: (
          <Suspense
            fallback={
              <LoadingSpinner message="Loading deal ordering..." />
            }
          >
            <CategoryDealOrdering />
          </Suspense>
        ),
      },
      {
        path: "addons",
        element: (
          <Suspense
            fallback={<LoadingSpinner message="Loading addon management..." />}
          >
            <AddonManagement />
          </Suspense>
        ),
      },
      {
        path: "declarations",
        element: (
          <Suspense
            fallback={
              <LoadingSpinner message="Loading declaration management..." />
            }
          >
            <DeclarationManagement />
          </Suspense>
        ),
      },
      {
        path: "optional-ingredients",
        element: (
          <Suspense
            fallback={
              <LoadingSpinner message="Loading optional ingredients management..." />
            }
          >
            <OptionalIngredientsManagement />
          </Suspense>
        ),
      },
      {
        path: "analytics",
        element: (
          <RequireAnyPermission
            permissions={[
              { resource: RESOURCES.ANALYTICS_REVENUE, action: ACTIONS.VIEW },
              { resource: RESOURCES.ANALYTICS, action: ACTIONS.VIEW },
            ]}
            redirectTo="/"
          >
            <Suspense
              fallback={<LoadingSpinner message="Loading revenue analytics..." />}
            >
              <RevenueAnalytics />
            </Suspense>
          </RequireAnyPermission>
        ),
      },
      {
        path: "insights",
        element: (
          <RequireAnyPermission
            permissions={[
              { resource: RESOURCES.ANALYTICS_CATEGORY_INSIGHTS, action: ACTIONS.VIEW },
              { resource: RESOURCES.ANALYTICS, action: ACTIONS.VIEW },
            ]}
            redirectTo="/"
          >
            <Suspense
              fallback={<LoadingSpinner message="Loading category insights..." />}
            >
              <CategoryInsights />
            </Suspense>
          </RequireAnyPermission>
        ),
      },
      {
        path: "settings",
        element: (
          <Suspense fallback={<LoadingSpinner message="Loading settings..." />}>
            <Settings />
          </Suspense>
        ),
      },
      {
        path: "reservations/settings",
        element: (
          <Suspense
            fallback={
              <LoadingSpinner message="Loading reservation settings..." />
            }
          >
            <ReservationSettings />
          </Suspense>
        ),
      },
      {
        path: "reservations",
        element: (
          <Suspense
            fallback={
              <LoadingSpinner message="Loading reservation management..." />
            }
          >
            <ReservationManagement />
          </Suspense>
        ),
      },
      {
        path: "reservations/tables",
        element: (
          <Suspense
            fallback={<LoadingSpinner message="Loading table management..." />}
          >
            <TableManagement />
          </Suspense>
        ),
      },
      {
        path: "zones",
        element: (
          <Suspense
            fallback={<LoadingSpinner message="Loading zone management..." />}
          >
            <ZoneManagement />
          </Suspense>
        ),
      },
      {
        path: "reservations/tables/status-grid",
        element: (
          <Suspense
            fallback={<LoadingSpinner message="Loading table status grid..." />}
          >
            <TableStatusGrid />
          </Suspense>
        ),
      },
      {
        path: "reservations/analytics",
        element: (
          <RequireAnyPermission
            permissions={[
              { resource: RESOURCES.ANALYTICS_RESERVATION, action: ACTIONS.VIEW },
              { resource: RESOURCES.ANALYTICS, action: ACTIONS.VIEW },
            ]}
            redirectTo="/"
          >
            <Suspense
              fallback={<LoadingSpinner message="Loading reservation analytics..." />}
            >
              <ReservationAnalytics />
            </Suspense>
          </RequireAnyPermission>
        ),
      },
      {
        path: "push-notifications",
        element: (
          <Suspense
            fallback={
              <LoadingSpinner message="Loading push notifications..." />
            }
          >
            <PushNotifications />
          </Suspense>
        ),
      },
      {
        path: "hero-section",
        element: (
          <Suspense
            fallback={
              <LoadingSpinner message="Loading hero section management..." />
            }
          >
            <HeroSectionManagement />
          </Suspense>
        ),
      },
      {
        path: "branches",
        element: (
          <Suspense
            fallback={<LoadingSpinner message="Loading branches..." />}
          >
            <BranchManagement />
          </Suspense>
        ),
      },
      {
        path: "branches/new",
        element: (
          <RequirePermission resource={RESOURCES.BRANCHES} action={ACTIONS.CREATE} redirectTo="/unauthorized">
            <Suspense
              fallback={<LoadingSpinner message="Loading branch form..." />}
            >
              <BranchCreate />
            </Suspense>
          </RequirePermission>
        ),
      },
      {
        path: "branches/:id/edit",
        element: (
          <Suspense
            fallback={<LoadingSpinner message="Loading branch form..." />}
          >
            <BranchCreate />
          </Suspense>
        ),
      },
      {
        path: "branches/:id/reservation-settings",
        element: (
          <Suspense
            fallback={<LoadingSpinner message="Loading reservation settings..." />}
          >
            <BranchReservationSettings />
          </Suspense>
        ),
      },
      {
        path: "deliverable-quantities",
        element: (
          <Suspense
            fallback={
              <LoadingSpinner message="Loading deliverable quantities..." />
            }
          >
            <DeliverableQuantities />
          </Suspense>
        ),
      },
      {
        path: "business-day",
        element: (
          <RequireAnyPermission
            permissions={[
              { resource: RESOURCES.END_OF_DAY, action: ACTIONS.VIEW },
              { resource: RESOURCES.REPORTS, action: ACTIONS.VIEW },
            ]}
            redirectTo="/admin"
          >
            <Suspense fallback={<LoadingSpinner message="Loading end of day..." />}>
              <BusinessDay />
            </Suspense>
          </RequireAnyPermission>
        ),
      },
      {
        path: "business-day/closed",
        element: (
          <RequireAnyPermission
            permissions={[
              { resource: RESOURCES.END_OF_DAY, action: ACTIONS.VIEW },
              { resource: RESOURCES.REPORTS, action: ACTIONS.VIEW },
            ]}
            redirectTo="/admin"
          >
            <Suspense fallback={<LoadingSpinner message="Loading closed days..." />}>
              <BusinessDayClosedDays />
            </Suspense>
          </RequireAnyPermission>
        ),
      },
      {
        path: "business-day/closed/:sessionId",
        element: (
          <RequireAnyPermission
            permissions={[
              { resource: RESOURCES.END_OF_DAY, action: ACTIONS.VIEW },
              { resource: RESOURCES.REPORTS, action: ACTIONS.VIEW },
            ]}
            redirectTo="/admin"
          >
            <Suspense fallback={<LoadingSpinner message="Loading closed day..." />}>
              <BusinessDayClosedDayDetails />
            </Suspense>
          </RequireAnyPermission>
        ),
      },
      {
        path: "terms-and-policies",
        element: (
          <Suspense
            fallback={
              <LoadingSpinner message="Loading terms and policies..." />
            }
          >
            <TermsAndPolicies />
          </Suspense>
        ),
      },
      {
        path: "terms-and-policies/form",
        element: (
          <Suspense
            fallback={
              <LoadingSpinner message="Loading policy form..." />
            }
          >
            <PolicyForm />
          </Suspense>
        ),
      },
    ],
  },
  {
    path: "terms-and-policies",
    element: (
      <Suspense
        fallback={<LoadingSpinner message="Loading terms and policies..." />}
      >
        <TermsAndPoliciesViewer />
      </Suspense>
    ),
    errorElement: <ErrorPage />,
  },
]);

// Render the app with or without Clerk
const AppContent = () => {
  if (isValidClerkKey) {
    return (
      <ClerkProvider
        publishableKey={clerkPublishableKey}
        {...(frontendDomain
          ? {
              signInFallbackRedirectUrl: frontendDomain,
              signUpFallbackRedirectUrl: frontendDomain,
            }
          : {})}
        appearance={{
          baseTheme: undefined,
          variables: {
            colorPrimary: "#ec4899", // Pink color to match your theme
            colorBackground: "#ffffff", // Light background
            colorInputBackground: "#ffffff", // Light input background
            colorText: "#000000", // Black text
            colorTextSecondary: "#666666", // Dark gray for secondary text
            borderRadius: "0.75rem", // Rounded corners
          },
          elements: {
            formButtonPrimary: {
              backgroundColor: "#ec4899",
              "&:hover": {
                backgroundColor: "#db2777",
              },
            },
            card: {
              backgroundColor: "#ffffff",
              border: "1px solid #e5e5e5",
            },
            headerTitle: {
              color: "#000000",
            },
            headerSubtitle: {
              color: "#666666",
            },
            socialButtonsBlockButton: {
              backgroundColor: "#ffffff",
              border: "1px solid #e5e5e5",
              color: "#000000",
              width: "auto",
              minWidth: "120px",
              flex: "0 0 auto",
              "&:hover": {
                backgroundColor: "#f5f5f5",
              },
            },
            socialButtonsBlockButtonApple: {
              backgroundColor: "#ffffff",
              border: "1px solid #e5e5e5",
              color: "#000000",
              width: "auto",
              minWidth: "120px",
              flex: "0 0 auto",
              "&:hover": {
                backgroundColor: "#f5f5f5",
              },
              "& svg": {
                color: "#000000",
                fill: "#000000",
                stroke: "#000000",
              },
              "& svg path": {
                fill: "#000000",
                stroke: "#000000",
              },
              "& svg g": {
                fill: "#000000",
                stroke: "#000000",
              },
              "& *": {
                color: "#000000",
                fill: "#000000",
                stroke: "#000000",
              },
            },
            socialButtonsBlockButtonGoogle: {
              backgroundColor: "#ffffff",
              border: "1px solid #e5e5e5",
              color: "#000000",
              width: "auto",
              minWidth: "120px",
              flex: "0 0 auto",
              "&:hover": {
                backgroundColor: "#f5f5f5",
              },
            },
            socialButtonsBlockButtonFacebook: {
              backgroundColor: "#ffffff",
              border: "1px solid #e5e5e5",
              color: "#000000",
              width: "auto",
              minWidth: "120px",
              flex: "0 0 auto",
              "&:hover": {
                backgroundColor: "#f5f5f5",
              },
            },
            socialButtonsBlock: {
              display: "flex",
              flexDirection: "row",
              gap: "12px",
              justifyContent: "center",
              flexWrap: "wrap",
            },
            formFieldInput: {
              backgroundColor: "#ffffff",
              border: "1px solid #e5e5e5",
              color: "#000000",
              "&:focus": {
                borderColor: "#ec4899",
                boxShadow: "0 0 0 2px rgba(236, 72, 153, 0.2)",
              },
            },
            formFieldLabel: {
              color: "#000000",
            },
            footerActionLink: {
              color: "#ec4899",
              "&:hover": {
                color: "#db2777",
              },
            },
            identityPreviewText: {
              color: "#a3a3a3",
            },
            formResendCodeLink: {
              color: "#ec4899",
            },
          },
        }}
      >
        <AuthProvider>
          <PermissionProvider>
            <SettingsProvider>
              <RouterProvider router={router} />
            </SettingsProvider>
          </PermissionProvider>
        </AuthProvider>
      </ClerkProvider>
    );
  } else if (isDevelopmentMode) {
    console.warn(
      "🔧 DEVELOPMENT MODE: Using placeholder Clerk key - login button will show but authentication won't work"
    );
    return (
      <ClerkProvider
        publishableKey={clerkPublishableKey}
        {...(frontendDomain
          ? {
              signInFallbackRedirectUrl: frontendDomain,
              signUpFallbackRedirectUrl: frontendDomain,
            }
          : {})}
        appearance={{
          baseTheme: undefined,
          variables: {
            colorPrimary: "#ec4899",
            colorBackground: "#0a0a0a",
            colorInputBackground: "#1a1a1a",
            colorText: "#ffffff",
            colorTextSecondary: "#a3a3a3",
            borderRadius: "0.75rem",
          },
          elements: {
            formButtonPrimary: {
              backgroundColor: "#ec4899",
              "&:hover": {
                backgroundColor: "#db2777",
              },
            },
            card: {
              backgroundColor: "#ffffff",
              border: "1px solid #e5e5e5",
            },
            headerTitle: {
              color: "#000000",
            },
            headerSubtitle: {
              color: "#666666",
            },
            socialButtonsBlockButton: {
              backgroundColor: "#ffffff",
              border: "1px solid #e5e5e5",
              color: "#000000",
              width: "auto",
              minWidth: "120px",
              flex: "0 0 auto",
              "&:hover": {
                backgroundColor: "#f5f5f5",
              },
            },
            socialButtonsBlockButtonApple: {
              backgroundColor: "#ffffff",
              border: "1px solid #e5e5e5",
              color: "#000000",
              width: "auto",
              minWidth: "120px",
              flex: "0 0 auto",
              "&:hover": {
                backgroundColor: "#f5f5f5",
              },
              "& svg": {
                color: "#000000",
                fill: "#000000",
                stroke: "#000000",
              },
              "& svg path": {
                fill: "#000000",
                stroke: "#000000",
              },
              "& svg g": {
                fill: "#000000",
                stroke: "#000000",
              },
              "& *": {
                color: "#000000",
                fill: "#000000",
                stroke: "#000000",
              },
            },
            socialButtonsBlockButtonGoogle: {
              backgroundColor: "#ffffff",
              border: "1px solid #e5e5e5",
              color: "#000000",
              width: "auto",
              minWidth: "120px",
              flex: "0 0 auto",
              "&:hover": {
                backgroundColor: "#f5f5f5",
              },
            },
            socialButtonsBlockButtonFacebook: {
              backgroundColor: "#ffffff",
              border: "1px solid #e5e5e5",
              color: "#000000",
              width: "auto",
              minWidth: "120px",
              flex: "0 0 auto",
              "&:hover": {
                backgroundColor: "#f5f5f5",
              },
            },
            socialButtonsBlock: {
              display: "flex",
              flexDirection: "row",
              gap: "12px",
              justifyContent: "center",
              flexWrap: "wrap",
            },
            formFieldInput: {
              backgroundColor: "#ffffff",
              border: "1px solid #e5e5e5",
              color: "#000000",
              "&:focus": {
                borderColor: "#ec4899",
                boxShadow: "0 0 0 2px rgba(236, 72, 153, 0.2)",
              },
            },
            formFieldLabel: {
              color: "#000000",
            },
            footerActionLink: {
              color: "#ec4899",
              "&:hover": {
                color: "#db2777",
              },
            },
            identityPreviewText: {
              color: "#a3a3a3",
            },
            formResendCodeLink: {
              color: "#ec4899",
            },
          },
        }}
      >
        <AuthProvider>
          <PermissionProvider>
            <SettingsProvider>
              <RouterProvider router={router} />
            </SettingsProvider>
          </PermissionProvider>
        </AuthProvider>
      </ClerkProvider>
    );
  } else {
    console.warn(
      "Clerk authentication disabled - using app without authentication"
    );
    return (
      <AuthProvider>
        <PermissionProvider>
          <SettingsProvider>
            <RouterProvider router={router} />
          </SettingsProvider>
        </PermissionProvider>
      </AuthProvider>
    );
  }
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <BranchProvider>
        <AppContent />
      </BranchProvider>
    </ErrorBoundary>
  </StrictMode>
);

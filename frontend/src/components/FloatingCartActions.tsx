import { Link, useLocation } from "react-router-dom";
import Icon from "@mdi/react";
import { mdiCart, mdiPlus } from "@mdi/js";
import { useCartStore } from "@/store/cartStore";
import { useTranslation } from "react-i18next";

export default function FloatingCartActions() {
  const location = useLocation();
  const { t } = useTranslation();
  const { getTotalItemCount } = useCartStore();
  const totalItemCount = getTotalItemCount();

  if (totalItemCount <= 0) return null;

  const isCart = location.pathname === "/cart";
  const isCheckout = location.pathname === "/checkout";

  const containerClassName = `fixed right-4 z-30 flex flex-col gap-3 ${
    isCheckout
      ? "bottom-[calc(14rem+env(safe-area-inset-bottom))]"
      : "bottom-[calc(5.25rem+env(safe-area-inset-bottom))]"
  }`;

  // Cart page: encourage adding more items, don't show Checkout floating button here.
  if (isCart) {
    return (
      <div className={containerClassName}>
        <Link
          to="/menu"
          className="flex items-center justify-center gap-2 rounded-full bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:bg-blue-500 active:scale-[0.98]"
          aria-label={t("floatingActions.addMoreItems")}
        >
          <Icon path={mdiPlus} size={0.75} />
          {t("floatingActions.addMoreItems")}
        </Link>
      </div>
    );
  }

  // Checkout page: show both Cart and Add more items.
  if (isCheckout) {
    return (
      <div className={containerClassName}>
        <Link
          to="/menu"
          className="flex items-center justify-center gap-2 rounded-full bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:bg-blue-500 active:scale-[0.98]"
          aria-label={t("floatingActions.addMoreItems")}
        >
          <Icon path={mdiPlus} size={0.75} />
          {t("floatingActions.addMoreItems")}
        </Link>

        <Link
          to="/cart"
          className="relative flex items-center justify-center gap-2 rounded-full bg-green-600 px-4 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:bg-green-500 active:scale-[0.98]"
          aria-label={t("floatingActions.goToCart")}
        >
          <Icon path={mdiCart} size={0.75} />
          {t("common.cart")}
          <span className="ml-1 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-white px-2 text-xs font-bold text-pink-500">
            {totalItemCount}
          </span>
        </Link>
      </div>
    );
  }

  const showCartButton = true;

  if (!showCartButton) return null;

  return (
    <div className={containerClassName}>
      {showCartButton && (
        <Link
          to="/cart"
          className="relative flex items-center justify-center gap-2 rounded-full bg-green-600 px-4 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:bg-green-500 active:scale-[0.98]"
          aria-label={t("floatingActions.goToCart")}
        >
          <Icon path={mdiCart} size={0.75} />
          {t("common.cart")}
          <span className="ml-1 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-white px-2 text-xs font-bold text-pink-500">
            {totalItemCount}
          </span>
        </Link>
      )}
    </div>
  );
}

import { useEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

export function useScrollToTop() {
  const location = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    if (navigationType === "POP") {
      return;
    }

    // Only scroll to top if no dialog is open
    // Check if there's a dialog overlay in the DOM
    const hasDialog =
      document.querySelector("[data-radix-popper-content-wrapper]") ||
      document.querySelector('[role="dialog"]') ||
      document.querySelector(".fixed.inset-0.z-50");

    if (!hasDialog) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [location.pathname, navigationType]);
}

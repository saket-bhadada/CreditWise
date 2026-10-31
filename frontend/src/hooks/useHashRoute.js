import { useEffect, useState } from "react";

/**
 * Tiny hash router (no extra dependency, works on any static host).
 *   #/                      -> home
 *   #/dashboard/<page-id>   -> dashboard page
 */
export const PAGES = [
  { id: "overview", label: "Overview", title: "System Overview" },
  { id: "prediction", label: "Prediction", title: "Borrower Risk Prediction" },
  { id: "shap", label: "SHAP", title: "SHAP Explainability" },
  { id: "ecl", label: "ECL", title: "Expected Credit Loss (ECL)" },
  { id: "stress", label: "Stress Test", title: "Macro Stress Simulator" },
  { id: "portfolio", label: "Portfolio", title: "Portfolio Analytics" },
  { id: "performance", label: "Performance", title: "Model Performance / Ablation" },
];

function parse(hash) {
  const clean = hash.replace(/^#\/?/, "");
  const [section, page] = clean.split("/");
  if (section === "dashboard") {
    const found = PAGES.find((p) => p.id === page);
    return { name: "dashboard", page: found ? found.id : "overview" };
  }
  return { name: "home", page: null };
}

export function navigate(to) {
  window.location.hash = to;
}

export function useHashRoute() {
  const [route, setRoute] = useState(() => parse(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parse(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

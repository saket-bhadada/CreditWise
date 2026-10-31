import React, { Suspense, lazy, useEffect } from "react";
import { PAGES, useHashRoute } from "./hooks/useHashRoute";
import { BorrowerProvider } from "./state/BorrowerContext";
import TopNav from "./components/layout/TopNav";
import Home from "./pages/Home";
import { LoadingBlock } from "./components/ui";

const pageModules = {
  overview: lazy(() => import("./pages/Overview")),
  prediction: lazy(() => import("./pages/Prediction")),
  shap: lazy(() => import("./pages/Shap")),
  ecl: lazy(() => import("./pages/Ecl")),
  stress: lazy(() => import("./pages/Stress")),
  portfolio: lazy(() => import("./pages/Portfolio")),
  performance: lazy(() => import("./pages/Performance")),
};

function Dashboard({ page }) {
  const Page = pageModules[page];
  useEffect(() => {
    const title = PAGES.find((p) => p.id === page)?.title ?? "Dashboard";
    document.title = `${title} · CreditWise`;
    window.scrollTo({ top: 0 });
  }, [page]);
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <TopNav page={page} />
      <Suspense
        fallback={
          <main className="page">
            <div className="panel">
              <LoadingBlock />
            </div>
          </main>
        }
      >
        <Page />
      </Suspense>
    </>
  );
}

export default function App() {
  const route = useHashRoute();
  useEffect(() => {
    if (route.name === "home") document.title = "CreditWise — Smarter Credit Decisions";
  }, [route.name]);
  return (
    <BorrowerProvider>{route.name === "home" ? <Home /> : <Dashboard page={route.page} />}</BorrowerProvider>
  );
}

import React, { useState } from "react";
import { DEFAULT_BORROWER_INPUTS } from "./api";
import Overview from "./pages/Overview.jsx";
import BorrowerRisk from "./pages/BorrowerRisk.jsx";
import Explainability from "./pages/Explainability.jsx";
import ECLPage from "./pages/ECLPage.jsx";
import StressSimulator from "./pages/StressSimulator.jsx";
import PortfolioPage from "./pages/PortfolioPage.jsx";
import PerformancePage from "./pages/PerformancePage.jsx";

const TABS = [
  { id: "overview", label: "1. System Overview" },
  { id: "borrower", label: "2. Borrower Risk Prediction" },
  { id: "explainability", label: "3. SHAP Explainability" },
  { id: "ecl", label: "4. Expected Credit Loss (ECL)" },
  { id: "stress", label: "5. Macro Stress Simulator" },
  { id: "portfolio", label: "6. Portfolio Analytics" },
  { id: "performance", label: "7. Model Performance (Ablation)" },
];

export default function App() {
  const [activeTab, setActiveTab] = useState("overview");
  const [borrowerInputs, setBorrowerInputs] = useState(DEFAULT_BORROWER_INPUTS);

  return (
    <div>
      <header className="app-header">
        <h1>
          CreditWise: Explainable Credit Risk Prediction &amp; Macroeconomic Stress Testing
        </h1>
        <p>
          Quantitative Decision-Support System | PD Estimation &bull; SHAP Attribution &bull; Expected Credit Loss (ECL = PD &times; LGD &times; EAD) &bull; Macroeconomic Scenario Simulation
        </p>
      </header>

      <nav className="nav-bar">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`nav-btn ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="main-container">
        {activeTab === "overview" && <Overview />}
        {activeTab === "borrower" && (
          <BorrowerRisk
            borrowerInputs={borrowerInputs}
            setBorrowerInputs={setBorrowerInputs}
            onNavigate={setActiveTab}
          />
        )}
        {activeTab === "explainability" && (
          <Explainability
            borrowerInputs={borrowerInputs}
            setBorrowerInputs={setBorrowerInputs}
          />
        )}
        {activeTab === "ecl" && <ECLPage borrowerInputs={borrowerInputs} />}
        {activeTab === "stress" && (
          <StressSimulator borrowerInputs={borrowerInputs} />
        )}
        {activeTab === "portfolio" && <PortfolioPage />}
        {activeTab === "performance" && <PerformancePage />}
      </main>
    </div>
  );
}

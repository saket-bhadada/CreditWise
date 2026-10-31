import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { DEFAULT_BORROWER } from "../lib/schema";

/**
 * Shared "active borrower" so Prediction, SHAP, ECL and Stress all operate on the same
 * inputs. `prediction` holds the last successful /api/predict response for this borrower.
 */
const Ctx = createContext(null);

export function BorrowerProvider({ children }) {
  const [inputs, setInputs] = useState(DEFAULT_BORROWER);
  const [prediction, setPrediction] = useState(null);

  const setField = useCallback((field, value) => {
    setInputs((prev) => ({ ...prev, [field]: value }));
    setPrediction(null); // inputs changed: the old result no longer describes them
  }, []);

  const replaceInputs = useCallback((next) => {
    setInputs({ ...next });
    setPrediction(null);
  }, []);

  const value = useMemo(
    () => ({ inputs, setField, replaceInputs, prediction, setPrediction }),
    [inputs, setField, replaceInputs, prediction]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBorrower() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useBorrower must be used inside <BorrowerProvider>");
  return ctx;
}

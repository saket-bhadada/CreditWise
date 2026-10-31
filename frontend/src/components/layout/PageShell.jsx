import React from "react";
import { CoinMark } from "../art/Coin";

export default function PageShell({ title, description, note, children }) {
  return (
    <main className="page" id="main">
      <div className="panel">
        <header className="page-head">
          <div>
            <h1>{title}</h1>
            {description && <p>{description}</p>}
          </div>
          {note && (
            <div className="head-art">
              <div className="sticky">{note}</div>
              <CoinMark />
            </div>
          )}
        </header>
        {children}
      </div>
    </main>
  );
}

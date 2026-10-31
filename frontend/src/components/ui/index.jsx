import React from "react";

export function Card({ title, sub, subMono, actions, children, className = "", flat = false, ...rest }) {
  return (
    <section className={`card ${flat ? "flat" : ""} ${className}`} {...rest}>
      {(title || sub || actions) && (
        <header className="card-head">
          {title && <h2 className="card-title">{title}</h2>}
          <div className="toolbar">
            {sub && <span className={`card-sub ${subMono ? "mono" : ""}`}>{sub}</span>}
            {actions}
          </div>
        </header>
      )}
      {children}
    </section>
  );
}

export function Kpi({ label, value, sub, tone = "ink", text = false }) {
  return (
    <div className="kpi" data-tone={tone}>
      <div className="kpi-label">{label}</div>
      <div className={`kpi-value ${text ? "text" : ""}`}>{value}</div>
      {sub != null && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

export function Badge({ tone = "default", children, title }) {
  return (
    <span className="badge" data-tone={tone} title={title}>
      {children}
    </span>
  );
}

export function Alert({ tone = "info", title, children, hint, actions }) {
  return (
    <div className="alert" data-tone={tone} role={tone === "error" ? "alert" : "status"}>
      {title && <strong>{title} </strong>}
      {children}
      {hint && <div className="alert-hint">{hint}</div>}
      {actions && <div className="alert-actions">{actions}</div>}
    </div>
  );
}

export function Skeleton({ height = 120, className = "" }) {
  return <div className={`skeleton ${className}`} style={{ height }} aria-hidden="true" />;
}

export function LoadingBlock({ label = "Loading from the CreditWise API…", rows = 3 }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      <div className="grid cols-4" aria-hidden="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} height={96} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} height={170} className="mb" />
      ))}
    </div>
  );
}

export function EmptyState({ icon = "☰", title, children }) {
  return (
    <div className="empty-state">
      <div className="icon" aria-hidden="true">
        {icon}
      </div>
      <strong>{title}</strong>
      {children && <div>{children}</div>}
    </div>
  );
}

/** Renders an ApiError with the details someone needs to fix it. Never invents data. */
export function ErrorState({ error, onRetry, title = "Could not load data from the API." }) {
  if (!error) return null;
  const kindLabel =
    {
      NETWORK: "Network error",
      TIMEOUT: "Timeout",
      HTTP: error.status ? `HTTP ${error.status}` : "HTTP error",
      PARSE: "Unexpected response",
    }[error.kind] || "Error";
  return (
    <Alert
      tone="error"
      title={`${title} (${kindLabel})`}
      hint={error.hint || null}
      actions={
        <>
          {onRetry && (
            <button type="button" className="btn small" onClick={onRetry}>
              Retry
            </button>
          )}
        </>
      }
    >
      <div>{error.message}</div>
      {(error.endpoint || error.url) && (
        <div className="mono" style={{ fontSize: 12.5, marginTop: 6, opacity: 0.85 }}>
          {error.endpoint}
          {error.url ? ` → ${error.url}` : ""}
        </div>
      )}
    </Alert>
  );
}

/**
 * Standard loading / error / empty wrapper.
 * `data` is only rendered when the request succeeded; stale data is kept on reload errors but flagged.
 */
export function DataState({ state, onRetry, children, skeleton, isEmpty }) {
  const { data, error, loading } = state;
  if (loading && !data) return skeleton || <LoadingBlock />;
  if (error && !data) return <ErrorState error={error} onRetry={onRetry} />;
  if (!data) return <LoadingBlock />;
  if (isEmpty && isEmpty(data)) {
    return <EmptyState title="The API returned no data for this view." />;
  }
  return (
    <>
      {error && <ErrorState error={error} onRetry={onRetry} title="Showing the last successful data; the refresh failed." />}
      {children(data)}
    </>
  );
}

export function Field({ id, label, hint, error, children }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? (
        <span className="err" id={`${id}-err`} role="alert">
          {error}
        </span>
      ) : (
        hint && <span className="hint">{hint}</span>
      )}
    </div>
  );
}

export function NumberField({ id, label, value, onChange, error, hint, step, min, max }) {
  return (
    <Field id={id} label={label} error={error} hint={hint}>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        value={value}
        step={step}
        min={min}
        max={max}
        aria-invalid={error ? "true" : "false"}
        aria-describedby={error ? `${id}-err` : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

export function SelectField({ id, label, value, onChange, options, error, hint, format }) {
  return (
    <Field id={id} label={label} error={error} hint={hint}>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o} value={o}>
            {format ? format(o) : o}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function SimpleTable({ columns, rows, rowKey, className = "", scrollY = false, caption }) {
  return (
    <div className={`table-wrap ${scrollY ? "scroll-y" : ""}`}>
      <table className={`dt ${className}`}>
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={c.num ? "num" : ""}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={rowKey ? rowKey(r, i) : i}>
              {columns.map((c) => (
                <td key={c.key} className={`${c.num ? "num" : ""} ${c.strong ? "strong" : ""}`}>
                  {c.render ? c.render(r, i) : r[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

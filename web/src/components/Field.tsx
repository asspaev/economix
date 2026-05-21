import type { ReactNode } from "react";

type FieldProps = {
  label: string;
  hint?: string;
  children: ReactNode;
  right?: ReactNode;
};

export function Field({ label, hint, children, right }: FieldProps) {
  return (
    <label className="col gap-2" style={{ width: "100%" }}>
      <div className="row between" style={{ alignItems: "baseline" }}>
        <span className="t-eyebrow">{label}</span>
        {right}
      </div>
      {children}
      {hint && (
        <span className="t-small dim" style={{ fontSize: 12 }}>
          {hint}
        </span>
      )}
    </label>
  );
}

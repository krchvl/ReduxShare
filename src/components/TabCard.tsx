import type { ReactNode } from "react";

interface TabCardGroupProps {
  label: string;
  columns?: number;
  children: ReactNode;
}

export function TabCardGroup({ label, columns = 3, children }: TabCardGroupProps) {
  return (
    <div
      className="tab-card-group"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      role={columns > 1 ? "group" : undefined}
      aria-label={label}
    >
      {children}
    </div>
  );
}

interface TabCardProps {
  icon: ReactNode;
  label: string;
  active?: boolean;
  role?: "radio" | "switch";
  onClick?: () => void;
}

export function TabCard({ icon, label, active = false, role = "radio", onClick }: TabCardProps) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={active}
      aria-label={label}
      className={`tab-card${active ? " tab-card--active" : ""}`}
      onClick={() => {
        if (role !== "radio" || !active) {
          onClick?.();
        }
      }}
    >
      <span className="tab-card__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="tab-card__label">{label}</span>
    </button>
  );
}

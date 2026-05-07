interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  size?: "regular" | "small";
}

export function Switch({ checked, onChange, label, size = "regular" }: SwitchProps) {
  return (
    <button
      className={`switch switch--${size} ${checked ? "switch--checked" : "switch--unchecked"}`}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
    >
      <span className="switch-handle" />
    </button>
  );
}

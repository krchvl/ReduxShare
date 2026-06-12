interface TextFieldProps {
  label: string;
  type?: "text" | "email" | "password";
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  disabled?: boolean;
  required?: boolean;
}

export function TextField({
  label,
  type = "text",
  value,
  onChange,
  autoComplete = "off",
  disabled = false,
  required = false
}: TextFieldProps) {
  return (
    <label className="field">
      <input
        className="field-input"
        type={type}
        value={value}
        autoComplete={autoComplete}
        disabled={disabled}
        required={required}
        onChange={(event) => onChange(event.target.value)}
      />
      <span className="field-label">{label}</span>
    </label>
  );
}

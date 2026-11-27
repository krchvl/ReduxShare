export type HumanizationOption = "humanTyping" | "humanPrecursors";

export function HumanizationIcon({ option }: { option: HumanizationOption }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {option === "humanTyping" && (
        <>
          <rect x="3" y="7" width="18" height="10" rx="2" />
          <path d="M7 11h.01" />
          <path d="M11 11h.01" />
          <path d="M15 11h.01" />
          <path d="M7 14h10" />
        </>
      )}
      {option === "humanPrecursors" && (
        <>
          <rect x="8" y="3" width="8" height="18" rx="4" />
          <path d="M12 7v3" />
        </>
      )}
    </svg>
  );
}

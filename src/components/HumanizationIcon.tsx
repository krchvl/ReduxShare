export type HumanizationOption = "humanTyping" | "humanPrecursors" | "humanReading" | "humanOrder";

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
      {option === "humanReading" && (
        <>
          <path d="M12 6C10 4.5 7 4 4 4v14c3 0 6 0.5 8 2 2-1.5 5-2 8-2V4c-3 0-6 0.5-8 2z" />
          <path d="M12 6v14" />
        </>
      )}
      {option === "humanOrder" && (
        <>
          <path d="M16 3h5v5" />
          <path d="M4 20 21 3" />
          <path d="M21 16v5h-5" />
          <path d="M15 15l6 6" />
          <path d="M4 4l5 5" />
        </>
      )}
    </svg>
  );
}

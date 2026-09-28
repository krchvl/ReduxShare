export type AiAccessMode = "official" | "custom";

export function AiAccessModeIcon({ mode }: { mode: AiAccessMode }) {
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
      {mode === "official" ? (
        <>
          <path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z" />
          <path d="M12 8v6" />
          <path d="M9.5 11h5" />
        </>
      ) : (
        <>
          <circle cx="8" cy="14" r="4" />
          <path d="M11 11l9-9" />
          <path d="M16 6l3 3" />
          <path d="M13 9l2.5 2.5" />
        </>
      )}
    </svg>
  );
}

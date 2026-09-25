import type { AiSettings } from "../types";

function Monogram({ letter }: { letter: string }) {
  return (
    <text
      x="12"
      y="16.5"
      textAnchor="middle"
      fontSize={letter.length > 1 ? 10 : 13}
      fontWeight={800}
      fontFamily="Inter, Arial, sans-serif"
      fill="currentColor"
      stroke="none"
    >
      {letter}
    </text>
  );
}

export function AiProviderIcon({ provider }: { provider: AiSettings["provider"] }) {
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
      {provider === "google" && <Monogram letter="G" />}
      {provider === "anthropic" && <Monogram letter="A" />}
      {provider === "xai" && <path d="M5 5l14 14M19 5L5 19" />}
      {provider === "groq" && <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />}
      {provider === "mistral" && (
        <>
          <path d="M4 7h16" />
          <path d="M6 11h14" />
          <path d="M4 15h16" />
          <path d="M7 19h12" />
        </>
      )}
      {provider === "openrouter" && (
        <>
          <circle cx="5" cy="5" r="2" />
          <circle cx="19" cy="5" r="2" />
          <circle cx="12" cy="19" r="2" />
          <path d="M6.5 6.5 11 17M17.5 6.5 13 17M7 5h10" />
        </>
      )}
      {provider === "openai" && (
        <>
          <path d="M12 3v18" />
          <path d="M3 12h18" />
          <path d="M5.6 5.6l12.8 12.8" />
          <path d="M18.4 5.6 5.6 18.4" />
        </>
      )}
      {provider === "deepseek" && (
        <>
          <path d="M3 9c3-4 6-4 9 0s6 4 9 0" />
          <path d="M3 15c3-4 6-4 9 0s6 4 9 0" />
        </>
      )}
      {provider === "custom" && (
        <>
          <path d="M7 4v16" />
          <path d="M12 4v16" />
          <path d="M17 4v16" />
          <circle cx="7" cy="14" r="2" fill="currentColor" stroke="none" />
          <circle cx="12" cy="8" r="2" fill="currentColor" stroke="none" />
          <circle cx="17" cy="16" r="2" fill="currentColor" stroke="none" />
        </>
      )}
    </svg>
  );
}

import type { CSSProperties, ReactNode } from "react";
import { Header } from "./Header";
import type { UpdateState } from "../types";

interface ShellProps {
  children: ReactNode;
  extensionEnabled: boolean;
  accentColor: string;
  updateState: UpdateState;
}

const DISABLED_ACCENT_COLOR = "#9ca3aa";

function mixHexWithWhite(hexColor: string, amount: number) {
  const normalizedColor = /^#[0-9a-f]{6}$/i.test(hexColor) ? hexColor.slice(1) : "9cb9f6";
  const channel = (start: number) => Math.round(start + (255 - start) * amount);
  const red = channel(Number.parseInt(normalizedColor.slice(0, 2), 16));
  const green = channel(Number.parseInt(normalizedColor.slice(2, 4), 16));
  const blue = channel(Number.parseInt(normalizedColor.slice(4, 6), 16));

  return `#${[red, green, blue].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

export function Shell({ children, extensionEnabled, accentColor, updateState }: ShellProps) {
  const effectiveAccentColor = extensionEnabled ? accentColor : DISABLED_ACCENT_COLOR;

  return (
    <main
      className="popup-shell"
      data-extension-enabled={extensionEnabled ? "true" : "false"}
      style={
        {
          "--accent": effectiveAccentColor,
          "--accent-soft": mixHexWithWhite(effectiveAccentColor, 0.28)
        } as CSSProperties
      }
    >
      <Header updateState={updateState} />
      {children}
    </main>
  );
}

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CustomSelect, type CustomSelectOption } from "../src/components/CustomSelect";

let root: Root | null = null;

function buildOptions(): CustomSelectOption[] {
  return [
    {
      value: "primary",
      label: "Primary",
      description: "https://primary.example.com",
      meta: createElement("span", { className: "meta-ping" }, "42 ms"),
    },
    { value: "mirror", label: "Mirror", description: "https://mirror.example.com" },
    { value: "off", label: "Off", disabled: true },
  ];
}

interface RenderSelectProps {
  value?: string;
  options?: CustomSelectOption[];
  footer?: boolean;
}

function renderSelect(props: RenderSelectProps = {}) {
  const onChange = vi.fn();
  const container = document.createElement("div");

  document.body.append(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      createElement(CustomSelect, {
        value: props.value ?? "primary",
        options: props.options ?? buildOptions(),
        onChange,
        ariaLabel: "Test select",
        listLabel: "Test list",
        footer: props.footer
          ? createElement("button", { type: "button", className: "footer-btn" }, "Footer action")
          : undefined,
      }),
    );
  });

  return { onChange };
}

function openListbox() {
  const trigger = document.querySelector<HTMLButtonElement>(".cselect__trigger");
  expect(trigger).not.toBeNull();

  act(() => {
    trigger!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

afterEach(() => {
  if (root) {
    act(() => {
      root?.unmount();
    });
    root = null;
  }
  document.body.innerHTML = "";
});

describe("CustomSelect", () => {
  it("renders the selected option label and its meta inside the trigger", () => {
    renderSelect();

    const trigger = document.querySelector(".cselect__trigger");

    expect(trigger?.textContent).toContain("Primary");
    expect(trigger?.querySelector(".cselect__trigger-meta .meta-ping")?.textContent).toBe("42 ms");
    expect(trigger?.getAttribute("aria-expanded")).toBe("false");
  });

  it("opens the listbox in a portal with options, descriptions and selection state", () => {
    renderSelect();
    openListbox();

    const listbox = document.querySelector('[role="listbox"]');
    const options = Array.from(document.querySelectorAll('[role="option"]'));

    expect(listbox).not.toBeNull();
    expect(options).toHaveLength(3);
    expect(options[0]?.textContent).toContain("https://primary.example.com");
    expect(document.querySelector('.cselect__option[aria-selected="true"]')?.textContent).toContain(
      "Primary",
    );
  });

  it("reports selection, skips disabled options and starts closing after pick", () => {
    const { onChange } = renderSelect();
    openListbox();

    const options = Array.from(document.querySelectorAll<HTMLElement>('[role="option"]'));

    act(() => {
      options[2]!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onChange).not.toHaveBeenCalled();

    act(() => {
      options[1]!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith("mirror");
    expect(document.querySelector(".cselect__listbox--closing")).not.toBeNull();
  });

  it("supports keyboard: ArrowDown opens and preselects, Enter picks, Escape closes", () => {
    const { onChange } = renderSelect();

    const trigger = document.querySelector<HTMLButtonElement>(".cselect__trigger");

    act(() => {
      trigger!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    });
    expect(document.querySelector('[role="listbox"]')).not.toBeNull();

    const listbox = document.querySelector<HTMLElement>('[role="listbox"]');

    act(() => {
      listbox!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith("mirror");

    openListbox();

    act(() => {
      document
        .querySelector<HTMLElement>('[role="listbox"]')!
        .dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(document.querySelector(".cselect__trigger")?.getAttribute("aria-expanded")).toBe(
      "false",
    );
    expect(document.querySelector(".cselect__listbox--closing")).not.toBeNull();
  });

  it("renders footer content whose interactions do not select options", () => {
    const { onChange } = renderSelect({ footer: true });
    openListbox();

    const footerButton = document.querySelector<HTMLButtonElement>(".footer-btn");

    expect(footerButton).not.toBeNull();

    act(() => {
      footerButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onChange).not.toHaveBeenCalled();
    expect(document.querySelector('[role="listbox"]')).not.toBeNull();
  });
});

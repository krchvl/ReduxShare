const LATEX_SYMBOLS: Record<string, string> = {
  gt: ">",
  lt: "<",
  ge: "≥",
  geq: "≥",
  le: "≤",
  leq: "≤",
  ne: "≠",
  neq: "≠",
  equiv: "≡",
  approx: "≈",
  sim: "∼",
  cong: "≅",
  propto: "∝",
  asymp: "≍",
  subset: "⊂",
  supset: "⊃",
  subseteq: "⊆",
  supseteq: "⊇",
  sqsubset: "⊏",
  sqsupset: "⊐",
  in: "∈",
  notin: "∉",
  ni: "∋",
  times: "×",
  div: "÷",
  pm: "±",
  mp: "∓",
  cdot: "·",
  circ: "∘",
  degree: "°",
  ast: "∗",
  star: "⋆",
  bullet: "•",
  oplus: "⊕",
  ominus: "⊖",
  otimes: "⊗",
  odot: "⊙",
  to: "→",
  rightarrow: "→",
  leftarrow: "←",
  gets: "←",
  leftrightarrow: "↔",
  uparrow: "↑",
  downarrow: "↓",
  Rightarrow: "⇒",
  Leftarrow: "⇐",
  Leftrightarrow: "⇔",
  implies: "⇒",
  iff: "⇔",
  mapsto: "↦",
  land: "∧",
  wedge: "∧",
  lor: "∨",
  vee: "∨",
  neg: "¬",
  lnot: "¬",
  forall: "∀",
  exists: "∃",
  nexists: "∄",
  therefore: "∴",
  because: "∵",
  cup: "∪",
  cap: "∩",
  emptyset: "∅",
  varnothing: "∅",
  infinity: "∞",
  partial: "∂",
  nabla: "∇",
  angle: "∠",
  triangle: "△",
  square: "□",
  ldots: "…",
  dots: "…",
  cdots: "⋯",
  vdots: "⋮",
  ddots: "⋱",
  prime: "′",
  langle: "⟨",
  rangle: "⟩",
  lfloor: "⌊",
  rfloor: "⌋",
  lceil: "⌈",
  rceil: "⌉",
  left: "",
  right: "",
  quad: " ",
  qquad: "  ",
  thinspace: " ",
  enspace: " ",
  negthinspace: "",
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  epsilon: "ε",
  varepsilon: "ε",
  zeta: "ζ",
  eta: "η",
  theta: "θ",
  vartheta: "ϑ",
  iota: "ι",
  kappa: "κ",
  lambda: "λ",
  mu: "μ",
  nu: "ν",
  xi: "ξ",
  omicron: "ο",
  pi: "π",
  rho: "ρ",
  sigma: "σ",
  tau: "τ",
  upsilon: "υ",
  phi: "φ",
  varphi: "ϕ",
  chi: "χ",
  psi: "ψ",
  omega: "ω",
  Gamma: "Γ",
  Delta: "Δ",
  Theta: "Θ",
  Lambda: "Λ",
  Xi: "Ξ",
  Pi: "Π",
  Sigma: "Σ",
  Upsilon: "Υ",
  Phi: "Φ",
  Psi: "Ψ",
  Omega: "Ω",
};

const BLACKBOARD_SYMBOLS: Record<string, string> = {
  C: "ℂ",
  F: "𝔽",
  H: "ℍ",
  N: "ℕ",
  P: "ℙ",
  Q: "ℚ",
  R: "ℝ",
  Z: "ℤ",
};

const SUPERSCRIPT_CHARACTERS: Record<string, string> = {
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
  "+": "⁺",
  "-": "⁻",
  "=": "⁼",
  "(": "⁽",
  ")": "⁾",
  a: "ᵃ",
  b: "ᵇ",
  c: "ᶜ",
  d: "ᵈ",
  e: "ᵉ",
  f: "ᶠ",
  g: "ᵍ",
  h: "ʰ",
  i: "ⁱ",
  j: "ʲ",
  k: "ᵏ",
  l: "ˡ",
  m: "ᵐ",
  n: "ⁿ",
  o: "ᵒ",
  p: "ᵖ",
  r: "ʳ",
  s: "ˢ",
  t: "ᵗ",
  u: "ᵘ",
  v: "ᵛ",
  w: "ʷ",
  x: "ˣ",
  y: "ʸ",
  z: "ᶻ",
};

const SUPERSCRIPT_PATTERN = /[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ᵃᵇᶜᵈᵉᶠᵍʰⁱʲᵏˡᵐⁿᵒᵖʳˢᵗᵘᵛʷˣʸᶻ]/g;

const TEXT_COMMANDS = new Set([
  "text",
  "mathrm",
  "textrm",
  "operatorname",
  "mbox",
  "textbf",
  "textit",
  "mathsf",
  "mathtt",
]);

const ESCAPED_CHARACTERS: Record<string, string> = {
  "%": "%",
  "&": "&",
  _: "_",
  "#": "#",
  $: "$",
  "{": "{",
  "}": "}",
  "(": "",
  ")": "",
  "[": "",
  "]": "",
  ",": " ",
  ";": " ",
  ":": " ",
  "!": "",
};

function readBalancedGroup(value: string, start: number): { content: string; end: number } | null {
  if (value[start] !== "{") {
    return null;
  }

  let depth = 0;

  for (let index = start; index < value.length; index += 1) {
    const char = value[index];

    if (char === "\\") {
      index += 1;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;

      if (depth === 0) {
        return { content: value.slice(start + 1, index), end: index + 1 };
      }
    }
  }

  return null;
}

function readSuperscript(value: string, start: number): { content: string; end: number } | null {
  const group = readBalancedGroup(value, start);

  if (group) {
    return group;
  }

  if (start >= value.length) {
    return null;
  }

  return { content: value[start], end: start + 1 };
}

function toSuperscript(content: string): string {
  let result = "";

  for (const char of content) {
    result += SUPERSCRIPT_CHARACTERS[char] ?? char;
  }

  return result;
}

function toRootPrefix(index: string): string {
  const normalized = index.trim();

  if (normalized === "3") {
    return "∛";
  }

  if (normalized === "4") {
    return "∜";
  }

  return `${toSuperscript(normalized)}√`;
}

function convertLatexString(value: string): string {
  let result = "";
  let index = 0;

  while (index < value.length) {
    const char = value[index];

    if (char === "^") {
      const superscript = readSuperscript(value, index + 1);

      if (superscript) {
        result += toSuperscript(superscript.content);
        index = superscript.end;
        continue;
      }
    }

    if (char !== "\\") {
      result += char;
      index += 1;
      continue;
    }

    const rest = value.slice(index);
    const commandMatch = /^\\([a-zA-Z]+)/.exec(rest);

    if (!commandMatch) {
      const escapedMatch = /^\\([^\s])/.exec(rest);

      if (escapedMatch) {
        result += Object.hasOwn(ESCAPED_CHARACTERS, escapedMatch[1])
          ? ESCAPED_CHARACTERS[escapedMatch[1]]
          : escapedMatch[1];
        index += escapedMatch[0].length;
        continue;
      }

      result += char;
      index += 1;
      continue;
    }

    const name = commandMatch[1];
    const cursor = index + commandMatch[0].length;

    if (name === "frac") {
      const numerator = readBalancedGroup(value, cursor);
      const denominator = numerator ? readBalancedGroup(value, numerator.end) : null;

      if (numerator && denominator) {
        result += `${convertLatexString(numerator.content)}/${convertLatexString(denominator.content)}`;
        index = denominator.end;
        continue;
      }
    }

    if (name === "sqrt") {
      let rootIndex = "";
      let contentStart = cursor;
      const indexMatch = /^\s*\[([^\]]*)\]/.exec(value.slice(cursor));

      if (indexMatch) {
        rootIndex = indexMatch[1];
        contentStart = cursor + indexMatch[0].length;
      }

      const radicand = readBalancedGroup(value, contentStart);

      if (radicand) {
        const base = convertLatexString(radicand.content);
        result += rootIndex ? `${toRootPrefix(rootIndex)}${base}` : `√${base}`;
        index = radicand.end;
        continue;
      }
    }

    if (name === "mathbb") {
      const group = readBalancedGroup(value, cursor);

      if (group) {
        const letter = group.content.trim();
        result += BLACKBOARD_SYMBOLS[letter] ?? convertLatexString(group.content);
        index = group.end;
        continue;
      }
    }

    if (TEXT_COMMANDS.has(name)) {
      const group = readBalancedGroup(value, cursor);

      if (group) {
        result += convertLatexString(group.content);
        index = group.end;
        continue;
      }
    }

    if (Object.hasOwn(LATEX_SYMBOLS, name)) {
      result += LATEX_SYMBOLS[name];
      index = cursor;
      continue;
    }

    result += commandMatch[0];
    index = cursor;
  }

  return result;
}

export function convertLatexTokensToSymbols(value: string): string {
  if (!value.includes("\\") && !value.includes("^")) {
    return value;
  }

  return convertLatexString(value);
}

export function flattenSuperscripts(value: string): string {
  return value.replace(SUPERSCRIPT_PATTERN, (char) => {
    const base = Object.entries(SUPERSCRIPT_CHARACTERS).find(
      ([, superscript]) => superscript === char,
    )?.[0];

    return base ?? char;
  });
}

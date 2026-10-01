export function getCheckIconMarkup() {
  return `<svg viewBox="0 0 48 48"><path d="M7 24.5 18.3 35.8 41 13.2" /></svg>`;
}

export function getSourceTabIconMarkup(kind: "internal" | "external" | "ai") {
  if (kind === "internal") {
    return `
      <svg viewBox="0 0 48 48">
        <path d="M10 14c0-4.4 6.3-8 14-8s14 3.6 14 8-6.3 8-14 8-14-3.6-14-8Z" />
        <path d="M10 14v10c0 4.4 6.3 8 14 8s14-3.6 14-8V14" />
        <path d="M10 24v10c0 4.4 6.3 8 14 8s14-3.6 14-8V24" />
      </svg>
    `;
  }

  if (kind === "external") {
    return `
      <svg viewBox="0 0 48 48">
        <circle cx="24" cy="24" r="18" />
        <path d="M6 24h36" />
        <path d="M24 6c5 5.2 7.5 11.2 7.5 18S29 36.8 24 42" />
        <path d="M24 6c-5 5.2-7.5 11.2-7.5 18S19 36.8 24 42" />
      </svg>
    `;
  }

  return `
    <svg viewBox="0 0 48 48">
      <path d="M24 7 27 17.5 38 21 27 24.5 24 35 21 24.5 10 21 21 17.5 24 7Z" />
      <path d="M36 31 37.2 35 41 36.2 37.2 37.4 36 41 34.8 37.4 31 36.2 34.8 35 36 31Z" />
    </svg>
  `;
}

function getChoiceTypeIconMarkup() {
  return `
    <svg viewBox="0 0 48 48">
      <circle cx="13" cy="14" r="6" />
      <circle cx="13" cy="34" r="6" />
      <path d="M26 14h16" />
      <path d="M26 34h16" />
    </svg>
  `;
}

function getTrueFalseTypeIconMarkup() {
  return `
    <svg viewBox="0 0 48 48">
      <path d="m7 13 5 5 9-9" />
      <path d="M30 14h11" />
      <path d="m8 31 8 8" />
      <path d="m16 31-8 8" />
      <path d="M30 37h11" />
    </svg>
  `;
}

function getShortanswerTypeIconMarkup() {
  return `
    <svg viewBox="0 0 48 48">
      <rect x="6" y="15" width="36" height="18" rx="3" />
      <path d="M20 21v6" />
    </svg>
  `;
}

function getMatchTypeIconMarkup() {
  return `
    <svg viewBox="0 0 48 48">
      <path d="M8 17h25" />
      <path d="m27 11 6 6-6 6" />
      <path d="M40 31H15" />
      <path d="m21 25-6 6 6 6" />
    </svg>
  `;
}

function getNumericalTypeIconMarkup() {
  return `
    <svg viewBox="0 0 48 48">
      <path d="M19 8 15 40" />
      <path d="M33 8l-4 32" />
      <path d="M9 18h33" />
      <path d="M6 30h33" />
    </svg>
  `;
}

function getGapselectTypeIconMarkup() {
  return `
    <svg viewBox="0 0 48 48">
      <rect x="6" y="15" width="36" height="18" rx="3" />
      <path d="m30 21-4 4 4 4" />
    </svg>
  `;
}

function getDragTypeIconMarkup() {
  return `
    <svg viewBox="0 0 48 48">
      <rect x="17" y="5" width="14" height="12" rx="2" />
      <path d="M24 17v10" />
      <path d="m19 22 5 5 5-5" />
      <path d="M8 37h32" />
    </svg>
  `;
}

function getMarkerTypeIconMarkup() {
  return `
    <svg viewBox="0 0 48 48">
      <path d="M24 42s-12-11.6-12-20a12 12 0 0 1 24 0c0 8.4-12 20-12 20Z" />
      <circle cx="24" cy="21" r="4.5" />
    </svg>
  `;
}

function getOrderingTypeIconMarkup() {
  return `
    <svg viewBox="0 0 48 48">
      <path d="M24 6v13" />
      <path d="m18 13 6 6 6-6" />
      <path d="M8 29h32" />
      <path d="M8 38h20" />
    </svg>
  `;
}

function getEssayTypeIconMarkup() {
  return `
    <svg viewBox="0 0 48 48">
      <path d="M8 12h32" />
      <path d="M8 21h32" />
      <path d="M8 30h24" />
      <path d="M8 39h16" />
    </svg>
  `;
}

function getMultianswerTypeIconMarkup() {
  return `
    <svg viewBox="0 0 48 48">
      <path d="M18 7c-4 0-6 2-6 6v5c0 3-2 5-5 5 3 0 5 2 5 5v5c0 4 2 6 6 6" />
      <path d="M30 7c4 0 6 2 6 6v5c0 3 2 5 5 5-3 0-5 2-5 5v5c0 4-2 6-6 6" />
    </svg>
  `;
}

function getCalculatedTypeIconMarkup() {
  return `
    <svg viewBox="0 0 48 48">
      <path d="M12 9h25l-15 15 15 15H12" />
    </svg>
  `;
}

function getUnknownTypeIconMarkup() {
  return `
    <svg viewBox="0 0 48 48">
      <circle cx="24" cy="24" r="18" />
      <path d="M19 19a5 5 0 1 1 7 4.6c-1.6.7-2 1.8-2 3.4" />
      <path d="M24 33v.5" />
    </svg>
  `;
}

export function getQuestionTypeScanIconMarkup(type: string) {
  switch (type) {
    case "multichoice":
    case "multichoiceset":
      return getChoiceTypeIconMarkup();
    case "truefalse":
      return getTrueFalseTypeIconMarkup();
    case "shortanswer":
      return getShortanswerTypeIconMarkup();
    case "matching":
    case "match":
      return getMatchTypeIconMarkup();
    case "numerical":
      return getNumericalTypeIconMarkup();
    case "gapselect":
      return getGapselectTypeIconMarkup();
    case "ddwtos":
    case "ddimageortext":
      return getDragTypeIconMarkup();
    case "ddmarker":
      return getMarkerTypeIconMarkup();
    case "ordering":
      return getOrderingTypeIconMarkup();
    case "essay":
      return getEssayTypeIconMarkup();
    case "multianswer":
      return getMultianswerTypeIconMarkup();
    case "calculated":
    case "calculatedsimple":
    case "calculatedmulti":
      return getCalculatedTypeIconMarkup();
    default:
      return getUnknownTypeIconMarkup();
  }
}

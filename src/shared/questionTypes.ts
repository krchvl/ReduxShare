// Human-readable labels for the Moodle question types returned by the answer
// database (the raw value is the qtype plugin name, e.g. "multichoice").
// Types missing from the map are shown as-is.
export const MOODLE_QUESTION_TYPE_LABELS: Record<string, { ru: string; en: string }> = {
  multichoice: { ru: "Множественный выбор", en: "Multiple choice" },
  multichoiceset: { ru: "Множественный выбор (всё или ничего)", en: "All-or-nothing multiple choice" },
  truefalse: { ru: "Верно / Неверно", en: "True / False" },
  shortanswer: { ru: "Короткий ответ", en: "Short answer" },
  numerical: { ru: "Числовой ответ", en: "Numerical" },
  matching: { ru: "Соответствие", en: "Matching" },
  essay: { ru: "Эссе", en: "Essay" },
  essayautograde: { ru: "Эссе (автопроверка)", en: "Essay (auto-graded)" },
  description: { ru: "Описание", en: "Description" },
  multianswer: { ru: "Вложенные ответы (Cloze)", en: "Embedded answers (Cloze)" },
  gapselect: { ru: "Выбор пропущенных слов", en: "Select missing words" },
  ddimageortext: { ru: "Перетаскивание в текст", en: "Drag and drop into text" },
  ddtohtml: { ru: "Перетаскивание на изображение", en: "Drag and drop onto image" },
  ddmarker: { ru: "Перетаскивание маркеров", en: "Drag and drop markers" },
  ddwtos: { ru: "Перетаскивание слов в текст", en: "Drag and drop words into sentences" },
  ordering: { ru: "Упорядочивание", en: "Ordering" },
  calculated: { ru: "Вычисляемый", en: "Calculated" },
  calculatedsimple: { ru: "Вычисляемый (простой)", en: "Calculated (simple)" },
  calculatedmulti: { ru: "Вычисляемый с вариантами", en: "Calculated multiple-choice" },
  random: { ru: "Случайный вопрос", en: "Random question" }
};

export function getQuestionTypeLabel(type: string | null | undefined, language: string | undefined) {
  const normalizedType = type?.trim().toLowerCase();

  if (!normalizedType) {
    return "—";
  }

  const label = MOODLE_QUESTION_TYPE_LABELS[normalizedType];

  if (!label) {
    return type!.trim();
  }

  return language === "ru" ? label.ru : label.en;
}

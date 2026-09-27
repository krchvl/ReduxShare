# AGENTS.md — ReduxShare

Browser extension (Manifest V3, Chrome + Firefox) for Moodle quizzes: scans questions on
`attempt.php` / `summary.php` / `review.php`, shows "R" answer widgets backed by a shared
PocketBase database, imports answers from review pages, optionally asks AI providers.
Read **`docs/ARCHITECTURE.md`** (Russian, authoritative, backend in `docs/SELFHOST_POCKETBASE.md`).

## Commands

```bash
npm run typecheck        # tsc -b --noEmit — must pass before commit
npm run lint             # eslint (lint:fix to autofix)
npm run format           # prettier --write .
npm test                 # vitest run, all tests in test/*.test.ts
npm run test:db          # live PocketBase test (RUN_POCKETBASE_LIVE_TESTS=1 + creds)
npm run build            # chrome → dist/chrome (+ zip); build:all adds firefox/xpi
```

- Build needs `.env` with `VITE_POCKETBASE_URL` (copy from `.env.example`); it's inlined into the bundle and `.env` is never committed.
- `npm run dev` serves the popup UI at `/` and a widget playground at `/dev.html` (`dev.html` + `src/dev/widgetPlayground.ts`): Moodle fixtures with mocked chrome APIs and in-memory answers/votes for interacting with the R-menu without building the extension. Dev-only — excluded from the extension build.

## Layout & boundaries

Built by `scripts/build-extension.mjs` (two Vite passes: "content" and the rest) into four
entry points:

- `src/main.tsx` + `src/App.tsx` — popup (React 19), login → register → main; `src/components/` is popup-only React UI; `MainScreen` is lazy-loaded.
- `src/background/external.ts` — MV3 service worker; **the only place allowed to hit the network for DB (PocketBase) and AI**. Everything else talks to it via `chrome.runtime` messages (`src/shared/messages.ts`).
- `src/content/stealthConsole.ts` — MAIN world, `document_start` (console suppression, copy unlock).
- `src/content/quizAttempt.ts` + `src/content/quizAttempt/*` — ISOLATED world, the core Moodle-page logic.

Supporting layers:

- `src/lib/` — PocketBase client/auth, RPC-equivalent data functions (`quizTasks.ts`, `userProfiles.ts`), AI (`ai.ts`, `aiProvider.ts`), storage/tabs/updates.
- `src/dom/` — reading Moodle question DOM, question types; `src/data/` — answer aggregation/review parsing; `src/ui/` — shadow-DOM UI for content pages (`answerMenu`, `quizPreviewPanel`).
- `src/shared/` — cross-context code: `storageKeys.ts` (every storage key), `messages.ts`, `questionTypes.ts`.
- `src/types.ts` — `Settings` / `AuthSession` etc. **with normalizers**; new settings must extend them.
- `src/i18n/` + `src/shared/i18nCore.ts` + `src/content/quizAttempt/contentI18n.ts` — custom ru/en i18n picked by browser language; parity is enforced by `test/i18nContentParity.test.ts` — add strings to both locales.
- `src/aiPrompts/*.json` — per-question-type AI prompts; `pocketbase/pb_migrations/*.js` — DB schema/API rules.

## Gotchas

- **`chrome.storage.local` is the only source of truth** (state under key `reduxshare`). The PocketBase client is created fresh per call with `autoCancellation(false)` — there is no shared memory between popup and worker; don't cache auth in a module singleton.
- PocketBase calls go through `withPocketBaseSessionRetry` (401/403 → refresh → retry). Keep that wrapping for new data functions.
- Review saves without a session must go to the pending queue (`reduxsharePendingReviewSaves`, max 25, dedup by `domain|course|quiz|attempt`) and flush later; diagnostics under `reduxshareQuizReviewSaveDiagnostics`.
- Versions in `.VERSION`, `package.json`, `public/manifest.json` must stay in sync.
- After a build, `dist/<browser>/assets/quizAttempt.js` must contain no top-level `import`/`export` (content-script bundle invariant).
- Manifest permissions are minimal (`storage`, `activeTab`, `alarms`); content scripts match only Moodle quiz pages. New network hosts go to `host_permissions` in `public/manifest.json`.
- AI API keys live only in `chrome.storage.local` and are sent only on explicit user action.
- Question-type support is a guarded matrix (`test/questionTypeMatrix.test.ts`, fixtures in `test/fixtures/`) — update both when touching question types.
- Unit tests run in happy-dom with chrome mocks from `test/setup.ts`; no real network.

## Conventions

- TypeScript strict, relative imports only (no path aliases).
- ESLint errors: `no-console` (only `warn`/`error`; exempt: `src/logic/runtime.ts`, `src/content/stealthConsole.ts`, `scripts/*.mjs`), `consistent-type-imports`, `no-floating-promises`, `unused-imports`, `react-hooks/exhaustive-deps`.
- Prettier: double quotes, width 100, LF. Husky + lint-staged on commit; commitlint enforces Conventional Commits (`feat(popup): …`, scopes: popup/content/app/i18n/preview).
- The user communicates in Russian — reply in Russian. Code and identifiers in English; user-facing strings only via i18n.

# Firebase backend setup

ReduxShare can use Firebase instead of PocketBase. The provider is chosen at build time with `VITE_DATA_PROVIDER=firebase`. This build uses Firebase Authentication (email/password) and Cloud Firestore directly over REST from the extension background worker; the `firebase` npm package is not required.

Only two project values are used:

- `VITE_FIREBASE_API_KEY` — Web API key from the project settings (public by design, not a secret).
- `VITE_FIREBASE_PROJECT_ID` — project ID such as `reduxshare-12345` (not the numeric project number).

Other fields from `firebaseConfig` (`authDomain`, `storageBucket`, `messagingSenderId`, `appId`) are ignored.

## Requirements

- Node.js 20+ and npm.
- A Google account.
- This repository with dependencies installed (`npm install`).
- No Firebase CLI is strictly required: security rules can be pasted into the console. The CLI is convenient for repeatable deployments.

## 1. Create a Firebase project

1. Open <https://console.firebase.google.com/>.
2. Click **Add project**.
3. Enter a project name (for example `reduxshare`). The generated project ID is what you need later.
4. Google Analytics is optional; it is not used by the extension.
5. Wait for project creation and open the project.

## 2. Register a Web app and copy the config

1. Open **Project settings** (gear icon) → **General**.
2. In **Your apps**, click the **Web** icon (`</>`).
3. Enter an app nickname (for example `reduxshare-extension`) and do **not** enable Hosting.
4. Click **Register app**.
5. Copy `apiKey` and `projectId` from the shown `firebaseConfig`. The rest can be ignored.

The Web API key is embedded into the extension bundle. It is public; access control is enforced by Firestore security rules and Firebase Authentication, not by hiding the key.

## 3. Enable email/password authentication

1. Open **Build** → **Authentication**.
2. Click **Get started** if prompted.
3. Open the **Sign-in method** tab.
4. Select **Email/Password**.
5. Enable **Email/Password** and save.

Notes:

- Email verification is not required by the extension. Registration returns a session immediately; the app does not check `email_verified`.
- If you later want to require verified emails, you must change the Firestore rules to check `request.auth.token.email_verified` and provide a way for users to verify. The extension has no verification UI, so this is not recommended.
- Firebase's email enumeration protection changes some error messages but does not break registration; errors are mapped to generic messages (`errors.registerFailed`, `errors.loginFailed`).

## 4. Create the Firestore database

1. Open **Build** → **Firestore Database**.
2. Click **Create database**.
3. Choose **Standard edition**:
   - **Standard edition** — simple query engine with automatic indexing, supports core operations. This is the current name of the classic Firestore database (previously called **Native mode**). Choose this one.
   - **Enterprise edition** — advanced query engine with self-managed indexing (supports core operations, pipelines, and MongoDB). It is not needed here: the extension uses the classic documents/query/commit API and relies on automatic single-field indexes.
   - On older consoles the same choice is shown as **Native mode** vs **Datastore mode**: pick **Native mode**.
4. Choose a location close to your users. The location is permanent for the project.
5. Start in **production mode**. The default rules will be replaced in the next step.

The extension uses the default database, `projects/<PROJECT_ID>/databases/(default)`.

## 5. Deploy security rules

The rules live in `firebase/firestore.rules`.

### Option A — Firebase console (no CLI)

1. Open **Firestore Database** → **Rules**.
2. Replace the contents with `firebase/firestore.rules`.
3. Click **Publish**.

### Option B — Firebase CLI

```bash
npx firebase-tools login
cd firebase
npx firebase-tools deploy --only firestore:rules,firestore:indexes --project <PROJECT_ID>
```

Run the deploy from the `firebase/` directory so that the relative paths in `firebase.json` resolve correctly. `firestore.indexes.json` is intentionally empty: the extension only uses equality filters and sorts client-side, so no composite indexes are needed.

For CI, use a token instead of an interactive login:

```bash
npx firebase-tools login:ci
npx firebase-tools deploy --only firestore:rules --project <PROJECT_ID> --token "$FIREBASE_TOKEN"
```

## 6. Build the extension for Firebase

Create or edit `.env` in the repository root:

```bash
VITE_DATA_PROVIDER=firebase
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_PROJECT_ID=reduxshare-xxxxx
```

Do not commit `.env`.

Build and load:

```bash
npm run build          # Chrome + Firefox
npm run build:chrome   # Chrome only
npm run build:firefox  # Firefox only
```

Load `dist/chrome` (or `dist/firefox`) as an unpacked extension. After changing `.env`, rebuild — the provider and Firebase config are inlined at build time.

The build script warns if `VITE_FIREBASE_API_KEY` or `VITE_FIREBASE_PROJECT_ID` is missing. The built manifest must contain these host permissions (they are added automatically only for Firebase builds):

- `https://identitytoolkit.googleapis.com/*`
- `https://securetoken.googleapis.com/*`
- `https://firestore.googleapis.com/*`

If they are missing, the provider was not detected during the build; check `.env` and rebuild.

## 7. First run

1. Open the extension popup.
2. Register with an email, username, and password.
3. Registration creates:
   - a Firebase Authentication user (email/password);
   - `users/{uid}` with the profile and counters;
   - `usernames/{hash}` to keep usernames case-insensitively unique.
4. Open any Moodle quiz attempt page and use the R-widget as usual. Answers, votes, essay examples, profiles, leaderboard, and attempt history now live in Firestore.

What works in the Firebase build:

- Email/password registration and login, including automatic token refresh.
- Internal answer fetch, review import, immediate selection saves, answer votes, quiz preview.
- Essay examples and votes.
- Profile, leaderboard, attempt history.
- Custom AI providers with your own API keys.
- Guest mode (`Continue without sign-in`) with the same restrictions as the PocketBase build.

What does not work in the Firebase build:

- Official AI mode. The official gateway lives on PocketBase, so the popup hides the official tab, plans, and quota cards; only the custom provider mode is available.
- The storage server picker. A Firebase build is bound to one project at build time.
- PocketBase multi-server selection and ping.

## Data model

| Collection                      | Document ID                                                                       | Purpose                                                                                                  |
| ------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `users/{uid}`                   | Firebase uid                                                                      | Public profile, username, Moodle domain, counters (`solved_*`, `imported_questions_count`, `attempt_*`). |
| `usernames/{hash}`              | `u` + fnv1a64 of the lowercase username                                           | Case-insensitive username reservation created during registration.                                       |
| `tasks/{hash}`                  | fnv1a64 of `(domain, course, quiz, questionId, questionHash, slotKey, answerKey)` | Aggregated answer rows with counters and vote totals.                                                    |
| `taskVotes/{taskId}__{uid}`     | task doc ID + user uid                                                            | One vote per user per answer row.                                                                        |
| `reviewImports/{uid}__{hash}`   | user uid + fnv1a64 of `(domain, attemptKey)`                                      | Review import deduplication and attempt history.                                                         |
| `essayExamples/{uid}__{hash}`   | user uid + fnv1a64 of `(domain, course, quiz, questionId, questionHash)`          | One essay example per user per question.                                                                 |
| `essayVotes/{exampleId}__{uid}` | example doc ID + user uid                                                         | One vote per user per essay example.                                                                     |

Field names are `snake_case` and mirror the PocketBase schema. `created` and `updated` are server timestamps rendered as ISO strings by the client. Contributor usernames are denormalized (`first_contributor_username`, `last_contributor_username`, `author_name`) because Firestore has no relation expansion.

### Security rules at a glance

- Every read and write requires an authenticated user.
- `users` — owner-only writes.
- `usernames` — create-only reservation owned by the creator.
- `tasks` — any authenticated user can create and update aggregated rows (same trust model as the PocketBase build); nobody can delete.
- `taskVotes` / `essayVotes` — a user can only create/update/delete their own vote.
- `reviewImports` / `essayExamples` — owner-scoped writes.
- Everything else is denied.

## Limits and quotas

- The **Spark (free) plan** is enough: no Cloud Functions are used. Firestore free daily quotas are limited (reads, writes, deletes, storage); a busy quiz site can exceed them. Upgrade to Blaze if needed.
- Firestore documents are limited to 1 MiB. `reviewImports` stores the per-question content hashes in one map field; extremely large quizzes could approach the limit (the PocketBase version allowed 2 MB).
- A commit accepts at most 500 writes; the client batches below that limit.
- Rules deployment and indexes do not require Blaze.
- Firestore location cannot be changed after creation.

## Security hardening

The default model matches the PocketBase deployment: shared answers are visible to every signed-in user, and counters are incremented by the client. Consider the following before distributing a Firebase build.

- **Do not restrict the Web API key by HTTP referrer in a way that excludes the extension.** Extension origins (`chrome-extension://...`, `moz-extension://...`) are not normal web referrers. If the key is restricted and requests start failing with `PERMISSION_DENIED` or `API key not valid`, remove the restriction and rely on Firestore rules.
- **Sign-ups are open to anyone who has the build.** If the build is private, disable new account creation after creating your users: **Authentication** → **Settings** → **User actions** → disable account creation. Firebase does not provide a per-project "invite only" flow for email/password.
- **Counters and the leaderboard are client-driven.** A user who extracts their own ID token can call the Firestore API directly and inflate counters or vote totals. This is a known limitation carried over from the PocketBase build. Enforcing integrity requires Cloud Functions or a server-side write path.
- **App Check is not supported.** Do not enable App Check enforcement for Authentication or Firestore: the extension does not send App Check tokens and all requests would be rejected.
- **The official AI gate is not part of this build.** There is no PocketBase account, no plan, and no quota. Custom AI keys are stored in `chrome.storage.local` and sent only on explicit user action, as in the PocketBase build.
- **No data migration.** A Firebase project starts empty. PocketBase data is not exported automatically.
- **Deleting a user in the Firebase console does not delete their documents.** Authentication records and the `users/{uid}` profile are separate; clean up `users`, `tasks`, votes, imports, and examples manually or with an Admin SDK script if needed.

## Backups

Firestore backups require the Blaze plan. Options:

- Firestore → **Backups** in the console (managed backups, Blaze only).
- Export to Cloud Storage with `gcloud firestore export gs://<bucket>`.
- For a small project, use the Firebase Admin SDK or the REST API to dump collections.

## Troubleshooting

| Symptom                                                              | Cause and fix                                                                                                                                                                                                                               |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Popup shows `Firebase is not configured…`                            | `VITE_FIREBASE_API_KEY` or `VITE_FIREBASE_PROJECT_ID` was missing at build time. Fill `.env` and rebuild.                                                                                                                                   |
| Login fails for every account                                        | Email/Password provider is disabled, or the API key/project ID is wrong. Check Authentication → Sign-in method and Project settings.                                                                                                        |
| Registration always fails with a generic error                       | Rules were not deployed, the username collection write is denied, or the database was created in Datastore/Enterprise mode. Deploy `firebase/firestore.rules` and create a **Standard edition** database (older consoles: **Native mode**). |
| `PERMISSION_DENIED` on every read                                    | Rules not published, the user is signed out, or a stale session from another provider is stored. Sign out, log in again; verify the Rules tab shows the repository rules.                                                                   |
| `API key not valid` / requests blocked                               | The Web API key is restricted (HTTP referrers, API restrictions). Allow the Identity Toolkit and Cloud Firestore APIs and remove referrer restrictions for extension use.                                                                   |
| Registration says the username is taken right after a failed attempt | A previous registration left a reservation, or another user owns it. Delete the stale `usernames/{hash}` document in the console, or choose another username.                                                                               |
| Review saves stay `queued`                                           | No valid session: the pending queue flushes after login (same behavior as PocketBase).                                                                                                                                                      |
| Answers are invisible to another user                                | Both users must be signed in; all reads require authentication.                                                                                                                                                                             |
| Votes/counters look wrong                                            | Counters are client-driven and can race; reload the page. Persistent negative values are clamped to zero by the client.                                                                                                                     |
| Build warns about missing Firebase config                            | `.env` was not picked up: check the variable names, remove quotes if they were pasted, and rebuild from the repository root.                                                                                                                |
| Requests fail behind a corporate proxy                               | The three `*.googleapis.com` hosts must be reachable; verify the manifest host permissions and the proxy/firewall.                                                                                                                          |

## Switching back to PocketBase

Set `VITE_DATA_PROVIDER=pocketbase` (or remove the variable), restore `VITE_POCKETBASE_URL`, and rebuild. Sessions are provider-tagged: a stored Firebase session is ignored and cleared after switching, so users sign in again against PocketBase.

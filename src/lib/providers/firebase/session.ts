import type { AuthSession } from "../../../types";
import { ensureSession, restoreSession } from "../../auth";
import { requireFirebaseConfig } from "./config";
import { createFirestoreClient, type FirestoreClient } from "./firestore";
import { isFirebaseUnauthenticatedError } from "./http";
import { mapUserDocument } from "./mappers";

export function createFirebaseClient(authSession: AuthSession): FirestoreClient {
  const config = requireFirebaseConfig();

  return createFirestoreClient({
    projectId: config.projectId,
    accessToken: authSession.accessToken,
  });
}

export async function withFirebaseSessionRetry<TResult>(
  authSession: AuthSession,
  runner: (client: FirestoreClient, session: AuthSession) => Promise<TResult>,
): Promise<{ authSession: AuthSession; result: TResult }> {
  let session = await ensureSession(authSession);

  try {
    return {
      authSession: session,
      result: await runner(createFirebaseClient(session), session),
    };
  } catch (error) {
    if (!isFirebaseUnauthenticatedError(error)) {
      throw error;
    }

    session = await restoreSession(session);

    return {
      authSession: session,
      result: await runner(createFirebaseClient(session), session),
    };
  }
}

export async function fetchContributorName(
  client: FirestoreClient,
  session: AuthSession,
): Promise<string> {
  const document = await client.getDocument(`users/${session.user.id}`);

  if (document) {
    const profile = mapUserDocument(document);
    const username = profile.username.trim();

    if (username) {
      return username;
    }

    if (profile.email.includes("@")) {
      return profile.email.split("@")[0];
    }
  }

  const email = session.user.email ?? "";
  return email.includes("@") ? email.split("@")[0] : "user";
}

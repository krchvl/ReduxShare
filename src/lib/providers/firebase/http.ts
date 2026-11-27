export const FIREBASE_REQUEST_TIMEOUT_MS = 15_000;

export class FirebaseApiError extends Error {
  status: number;
  code: string | null;

  constructor(options: { status: number; message?: string | null; code?: string | null }) {
    super(options.message ?? `Firebase request failed with status ${options.status}.`);
    this.name = "FirebaseApiError";
    this.status = options.status;
    this.code = options.code ?? null;
  }
}

interface FirebaseErrorBody {
  error?: {
    code?: unknown;
    message?: unknown;
    status?: unknown;
  };
}

function parseErrorBody(body: unknown) {
  if (!body || typeof body !== "object") {
    return { message: null, code: null };
  }

  const error = (body as FirebaseErrorBody).error;

  if (!error || typeof error !== "object") {
    return { message: null, code: null };
  }

  const message = typeof error.message === "string" ? error.message : null;
  const status = typeof error.status === "string" ? error.status : null;

  return { message, code: status ?? message };
}

export async function firebaseFetchJson<TResult>(
  url: string,
  init: RequestInit,
  timeoutMs = FIREBASE_REQUEST_TIMEOUT_MS,
): Promise<TResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;

  try {
    response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    throw new FirebaseApiError({
      status: 0,
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    clearTimeout(timeoutId);
  }

  const rawBody = await response.text();
  let body: unknown = null;

  if (rawBody) {
    try {
      body = JSON.parse(rawBody);
    } catch {
      body = rawBody;
    }
  }

  if (!response.ok) {
    const parsed = parseErrorBody(body);

    throw new FirebaseApiError({
      status: response.status,
      message:
        parsed.message ??
        (typeof body === "string" && body
          ? body
          : `Firebase request failed with status ${response.status}.`),
      code: parsed.code,
    });
  }

  return body as TResult;
}

export function isFirebaseUnauthenticatedError(error: unknown): boolean {
  return error instanceof FirebaseApiError && error.status === 401;
}

export function isFirebaseNotFoundError(error: unknown): boolean {
  return error instanceof FirebaseApiError && (error.status === 404 || error.code === "NOT_FOUND");
}

export function isFirebasePreconditionError(error: unknown): boolean {
  return (
    error instanceof FirebaseApiError &&
    (error.status === 409 ||
      error.code === "ALREADY_EXISTS" ||
      error.code === "FAILED_PRECONDITION")
  );
}

export function isFirebasePermissionError(error: unknown): boolean {
  return (
    error instanceof FirebaseApiError &&
    (error.status === 403 || error.code === "PERMISSION_DENIED")
  );
}

export function getFirebaseErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

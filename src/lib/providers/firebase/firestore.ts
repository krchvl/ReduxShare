import { getFirestoreDatabaseRoot, getFirestoreDocumentsUrl } from "./config";
import { firebaseFetchJson, isFirebaseNotFoundError } from "./http";

export type FirestoreValue =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { timestampValue: string }
  | { stringValue: string }
  | { referenceValue: string }
  | { arrayValue: { values?: FirestoreValue[] } }
  | { mapValue: { fields?: Record<string, FirestoreValue> } };

export interface FirestoreDocument {
  name: string;
  fields?: Record<string, FirestoreValue>;
  createTime?: string;
  updateTime?: string;
}

export interface FirestoreDocumentData {
  id: string;
  name: string;
  fields: Record<string, unknown>;
  createTime: string | null;
  updateTime: string | null;
}

export interface FirestoreWriteTransform {
  fieldPath: string;
  increment?: { integerValue: string } | { doubleValue: number };
  setToServerValue?: "REQUEST_TIME";
}

export interface FirestoreWrite {
  update?: { name: string; fields?: Record<string, FirestoreValue> };
  updateMask?: { fieldPaths: string[] };
  updateTransforms?: FirestoreWriteTransform[];
  currentDocument?: { exists: boolean };
  transform?: { document: string; fieldTransforms: FirestoreWriteTransform[] };
  delete?: string;
}

export type FirestoreFilterOperator =
  | "EQUAL"
  | "NOT_EQUAL"
  | "LESS_THAN"
  | "LESS_THAN_OR_EQUAL"
  | "GREATER_THAN"
  | "GREATER_THAN_OR_EQUAL"
  | "ARRAY_CONTAINS"
  | "IN"
  | "NOT_IN"
  | "ARRAY_CONTAINS_ANY";

export interface FirestoreFilter {
  field: string;
  value: unknown;
  op?: FirestoreFilterOperator;
}

export interface FirestoreOrder {
  field: string;
  direction?: "ASCENDING" | "DESCENDING";
}

export interface FirestoreQueryOptions {
  filters?: FirestoreFilter[];
  orderBy?: FirestoreOrder[];
  limit?: number;
}

export interface FirestoreClient {
  getDocument(path: string): Promise<FirestoreDocumentData | null>;
  batchGet(paths: string[]): Promise<Array<FirestoreDocumentData | null>>;
  runQuery(collectionId: string, options?: FirestoreQueryOptions): Promise<FirestoreDocumentData[]>;
  runCount(collectionId: string, options?: FirestoreQueryOptions): Promise<number>;
  commit(writes: FirestoreWrite[]): Promise<void>;
}

export function normalizeFirestoreTimestamp(value: string): string {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value : new Date(parsed).toISOString();
}

export function encodeFirestoreValue(value: unknown): FirestoreValue {
  if (value === null || value === undefined) {
    return { nullValue: null };
  }

  if (typeof value === "string") {
    return { stringValue: value };
  }

  if (typeof value === "boolean") {
    return { booleanValue: value };
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return { nullValue: null };
    }

    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }

  if (value instanceof Date) {
    return { timestampValue: value.toISOString() };
  }

  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map((item) => encodeFirestoreValue(item)) } };
  }

  if (typeof value === "object") {
    return {
      mapValue: { fields: encodeFirestoreFields(value as Record<string, unknown>) },
    };
  }

  return { nullValue: null };
}

export function encodeFirestoreFields(
  data: Record<string, unknown>,
): Record<string, FirestoreValue> {
  const fields: Record<string, FirestoreValue> = {};

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) {
      continue;
    }

    fields[key] = encodeFirestoreValue(value);
  }

  return fields;
}

export function decodeFirestoreValue(value: FirestoreValue): unknown {
  if ("nullValue" in value) {
    return null;
  }

  if ("booleanValue" in value) {
    return value.booleanValue;
  }

  if ("integerValue" in value) {
    return Number.parseInt(value.integerValue, 10);
  }

  if ("doubleValue" in value) {
    return value.doubleValue;
  }

  if ("timestampValue" in value) {
    return normalizeFirestoreTimestamp(value.timestampValue);
  }

  if ("stringValue" in value) {
    return value.stringValue;
  }

  if ("referenceValue" in value) {
    return value.referenceValue;
  }

  if ("arrayValue" in value) {
    return (value.arrayValue.values ?? []).map((item) => decodeFirestoreValue(item));
  }

  if ("mapValue" in value) {
    return decodeFirestoreFields(value.mapValue.fields ?? {});
  }

  return null;
}

export function decodeFirestoreFields(
  fields: Record<string, FirestoreValue>,
): Record<string, unknown> {
  const decoded: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(fields)) {
    decoded[key] = decodeFirestoreValue(value);
  }

  return decoded;
}

export function decodeFirestoreDocument(document: FirestoreDocument): FirestoreDocumentData {
  const segments = document.name.split("/");
  const id = segments[segments.length - 1] ?? "";

  return {
    id,
    name: document.name,
    fields: decodeFirestoreFields(document.fields ?? {}),
    createTime: document.createTime ? normalizeFirestoreTimestamp(document.createTime) : null,
    updateTime: document.updateTime ? normalizeFirestoreTimestamp(document.updateTime) : null,
  };
}

export function documentResourceName(projectId: string, path: string): string {
  return `${getFirestoreDatabaseRoot(projectId)}/${path.replace(/^\/+/, "")}`;
}

export function documentUrl(projectId: string, path: string): string {
  return `${getFirestoreDocumentsUrl(projectId)}/${path.replace(/^\/+/, "")}`;
}

export function buildStructuredQuery(collectionId: string, options: FirestoreQueryOptions = {}) {
  const filters = options.filters ?? [];
  const query: Record<string, unknown> = {
    from: [{ collectionId }],
  };

  if (filters.length > 0) {
    query.where = {
      compositeFilter: {
        op: "AND",
        filters: filters.map((filter) => ({
          fieldFilter: {
            field: { fieldPath: filter.field },
            op: filter.op ?? "EQUAL",
            value: encodeFirestoreValue(filter.value),
          },
        })),
      },
    };
  }

  if (options.orderBy && options.orderBy.length > 0) {
    query.orderBy = options.orderBy.map((order) => ({
      field: { fieldPath: order.field },
      direction: order.direction ?? "ASCENDING",
    }));
  }

  if (typeof options.limit === "number" && Number.isFinite(options.limit)) {
    query.limit = Math.max(0, Math.trunc(options.limit));
  }

  return query;
}

function omitTimestampFields(data: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...data };
  delete copy.created;
  delete copy.updated;
  return copy;
}

function serverTimestampTransform(fieldPath: string): FirestoreWriteTransform {
  return { fieldPath, setToServerValue: "REQUEST_TIME" };
}

function incrementTransform(fieldPath: string, delta: number): FirestoreWriteTransform {
  return {
    fieldPath,
    increment: Number.isInteger(delta) ? { integerValue: String(delta) } : { doubleValue: delta },
  };
}

export function createDocumentWrite(
  projectId: string,
  path: string,
  data: Record<string, unknown>,
): FirestoreWrite {
  const name = documentResourceName(projectId, path);

  return {
    update: { name, fields: encodeFirestoreFields(omitTimestampFields(data)) },
    currentDocument: { exists: false },
    updateTransforms: [serverTimestampTransform("created"), serverTimestampTransform("updated")],
  };
}

export function updateDocumentWrite(
  projectId: string,
  path: string,
  data: Record<string, unknown>,
  fieldPaths?: string[],
): FirestoreWrite {
  const name = documentResourceName(projectId, path);
  const fields = encodeFirestoreFields(omitTimestampFields(data));
  const mask = fieldPaths ?? Object.keys(fields);

  return {
    update: { name, fields },
    updateMask: { fieldPaths: mask },
    updateTransforms: [serverTimestampTransform("updated")],
  };
}

export function incrementDocumentWrite(
  projectId: string,
  path: string,
  increments: Record<string, number>,
): FirestoreWrite {
  const name = documentResourceName(projectId, path);
  const fieldTransforms: FirestoreWriteTransform[] = [];

  for (const [fieldPath, delta] of Object.entries(increments)) {
    if (!delta) {
      continue;
    }

    fieldTransforms.push(incrementTransform(fieldPath, delta));
  }

  fieldTransforms.push(serverTimestampTransform("updated"));

  return {
    transform: { document: name, fieldTransforms },
  };
}

export function updateDocumentWithIncrementsWrite(
  projectId: string,
  path: string,
  data: Record<string, unknown>,
  increments: Record<string, number>,
): FirestoreWrite {
  const name = documentResourceName(projectId, path);
  const fields = encodeFirestoreFields(omitTimestampFields(data));
  const fieldTransforms: FirestoreWriteTransform[] = [];

  for (const [fieldPath, delta] of Object.entries(increments)) {
    if (!delta) {
      continue;
    }

    fieldTransforms.push(incrementTransform(fieldPath, delta));
  }

  fieldTransforms.push(serverTimestampTransform("updated"));

  if (Object.keys(fields).length === 0) {
    return {
      transform: { document: name, fieldTransforms },
    };
  }

  return {
    update: { name, fields },
    updateMask: { fieldPaths: Object.keys(fields) },
    updateTransforms: fieldTransforms,
  };
}

export function deleteDocumentWrite(projectId: string, path: string): FirestoreWrite {
  return { delete: documentResourceName(projectId, path) };
}

interface QueryResult {
  document?: FirestoreDocument;
}

interface BatchGetResult {
  found?: FirestoreDocument;
  missing?: string;
}

interface AggregationResult {
  result?: {
    aggregateFields?: Record<string, FirestoreValue>;
  };
}

export function createFirestoreClient(options: {
  projectId: string;
  accessToken: string;
}): FirestoreClient {
  const documentsUrl = getFirestoreDocumentsUrl(options.projectId);

  function request<TResult>(url: string, init: RequestInit): Promise<TResult> {
    return firebaseFetchJson<TResult>(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${options.accessToken}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
  }

  function urlOf(path: string): string {
    return `${documentsUrl}/${path.replace(/^\/+/, "")}`;
  }

  function resourceNameOf(path: string): string {
    return documentResourceName(options.projectId, path);
  }

  return {
    async getDocument(path) {
      try {
        const document = await request<FirestoreDocument>(urlOf(path), {
          method: "GET",
        });

        return decodeFirestoreDocument(document);
      } catch (error) {
        if (isFirebaseNotFoundError(error)) {
          return null;
        }

        throw error;
      }
    },

    async batchGet(paths) {
      if (paths.length === 0) {
        return [];
      }

      const names = paths.map((path) => resourceNameOf(path));
      const results = await request<BatchGetResult[]>(`${documentsUrl}:batchGet`, {
        method: "POST",
        body: JSON.stringify({ documents: names }),
      });
      const byName = new Map<string, FirestoreDocumentData>();

      for (const result of Array.isArray(results) ? results : []) {
        if (result?.found?.name) {
          byName.set(result.found.name, decodeFirestoreDocument(result.found));
        }
      }

      return names.map((name) => byName.get(name) ?? null);
    },

    async runQuery(collectionId, queryOptions) {
      const results = await request<QueryResult[]>(`${documentsUrl}:runQuery`, {
        method: "POST",
        body: JSON.stringify({
          structuredQuery: buildStructuredQuery(collectionId, queryOptions),
        }),
      });

      return (Array.isArray(results) ? results : [])
        .filter((result): result is QueryResult & { document: FirestoreDocument } =>
          Boolean(result?.document),
        )
        .map((result) => decodeFirestoreDocument(result.document));
    },

    async runCount(collectionId, queryOptions) {
      const results = await request<AggregationResult[]>(`${documentsUrl}:runAggregationQuery`, {
        method: "POST",
        body: JSON.stringify({
          structuredAggregationQuery: {
            structuredQuery: buildStructuredQuery(collectionId, queryOptions),
            aggregations: [{ alias: "total", count: {} }],
          },
        }),
      });
      const first = Array.isArray(results) ? results[0] : null;
      const total = first?.result?.aggregateFields?.total;

      if (!total) {
        return 0;
      }

      const decoded = decodeFirestoreValue(total);
      return typeof decoded === "number" && Number.isFinite(decoded) ? decoded : 0;
    },

    async commit(writes) {
      if (writes.length === 0) {
        return;
      }

      await request(`${documentsUrl}:commit`, {
        method: "POST",
        body: JSON.stringify({ writes }),
      });
    },
  };
}

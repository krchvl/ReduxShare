import { vi } from "vitest";
import {
  decodeFirestoreFields,
  decodeFirestoreValue,
  encodeFirestoreFields,
  type FirestoreValue,
} from "../src/lib/providers/firebase/firestore";

export const PROJECT_ID = "demo";
export const DOCUMENTS_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

interface WriteBody {
  update?: { name: string; fields?: Record<string, FirestoreValue> };
  updateMask?: { fieldPaths?: string[] };
  updateTransforms?: Array<{
    fieldPath: string;
    increment?: { integerValue?: string; doubleValue?: number };
    setToServerValue?: string;
  }>;
  currentDocument?: { exists?: boolean };
  transform?: {
    document: string;
    fieldTransforms: Array<{
      fieldPath: string;
      increment?: { integerValue?: string; doubleValue?: number };
      setToServerValue?: string;
    }>;
  };
  delete?: string;
}

function pathFromName(name: string): string {
  const marker = "/documents/";
  const index = name.indexOf(marker);
  return index >= 0 ? name.slice(index + marker.length) : name;
}

export class FakeFirestore {
  docs = new Map<string, Record<string, unknown>>();
  private tick = 0;

  seed(path: string, fields: Record<string, unknown>) {
    const timestamp = this.nextTimestamp();
    this.docs.set(path, { created: timestamp, updated: timestamp, ...fields });
    return this;
  }

  read(path: string) {
    return this.docs.get(path) ?? null;
  }

  install() {
    const mock = vi.fn((url: string, init: RequestInit) => this.handle(url, init));
    vi.stubGlobal("fetch", mock);
    return mock;
  }

  private nextTimestamp() {
    this.tick += 1;
    return new Date(Date.UTC(2026, 10, 20, 0, 0, this.tick)).toISOString();
  }

  private json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status });
  }

  private docResponse(path: string) {
    const fields = this.docs.get(path);

    if (!fields) {
      return this.json(
        { error: { code: 404, status: "NOT_FOUND", message: "missing document" } },
        404,
      );
    }

    return this.json({
      name: `${DOCUMENTS_BASE}/${path}`,
      fields: encodeFirestoreFields(fields),
      createTime: String(fields.created ?? this.nextTimestamp()),
      updateTime: String(fields.updated ?? this.nextTimestamp()),
    });
  }

  private matches(collectionPath: string, filters: Array<Record<string, unknown>>) {
    return [...this.docs.entries()].filter(([path, fields]) => {
      if (!path.startsWith(`${collectionPath}/`)) {
        return false;
      }

      return filters.every((filter) => {
        const field = ((filter.field as { fieldPath?: string } | undefined)?.fieldPath ??
          "") as string;
        const op = (filter.op as string | undefined) ?? "EQUAL";
        const expected = decodeFirestoreValue(filter.value as never);
        const actual = fields[field];

        switch (op) {
          case "GREATER_THAN":
            return typeof actual === "number" && actual > (expected as number);
          case "GREATER_THAN_OR_EQUAL":
            return typeof actual === "number" && actual >= (expected as number);
          case "LESS_THAN":
            return typeof actual === "number" && actual < (expected as number);
          case "NOT_EQUAL":
            return actual !== expected;
          default:
            return actual === expected;
        }
      });
    });
  }

  private sortAndLimit(
    rows: Array<[string, Record<string, unknown>]>,
    query: Record<string, unknown>,
  ) {
    const orderBy =
      (query.orderBy as Array<{
        field?: { fieldPath?: string };
        direction?: string;
      }>) ?? [];
    const sorted = [...rows];

    if (orderBy.length > 0) {
      sorted.sort(([pathA, first], [pathB, second]) => {
        for (const order of orderBy) {
          const field = order.field?.fieldPath ?? "";
          const left = first[field] as number | string | undefined;
          const right = second[field] as number | string | undefined;

          if (left === right) {
            continue;
          }

          const comparison = (left ?? 0) < (right ?? 0) ? -1 : 1;
          return order.direction === "DESCENDING" ? -comparison : comparison;
        }

        return pathA.localeCompare(pathB);
      });
    }

    return typeof query.limit === "number" ? sorted.slice(0, query.limit) : sorted;
  }

  private applyTransforms(
    fields: Record<string, unknown>,
    transforms: WriteBody["updateTransforms"],
  ) {
    for (const transform of transforms ?? []) {
      if (transform.increment) {
        const delta = transform.increment.integerValue
          ? Number.parseInt(transform.increment.integerValue, 10)
          : (transform.increment.doubleValue ?? 0);
        fields[transform.fieldPath] = ((fields[transform.fieldPath] as number) ?? 0) + delta;
      }

      if (transform.setToServerValue !== undefined) {
        fields[transform.fieldPath] = this.nextTimestamp();
      }
    }
  }

  private async handle(url: string, init: RequestInit): Promise<Response> {
    const body = typeof init.body === "string" ? JSON.parse(init.body) : {};

    if (url === `${DOCUMENTS_BASE}:batchGet`) {
      const names = (body.documents ?? []) as string[];

      return this.json(
        names.map((name) => {
          const path = pathFromName(name);
          const fields = this.docs.get(path);

          return fields
            ? {
                found: {
                  name,
                  fields: encodeFirestoreFields(fields),
                  createTime: fields.created,
                  updateTime: fields.updated,
                },
              }
            : { missing: name };
        }),
      );
    }

    if (url === `${DOCUMENTS_BASE}:runQuery`) {
      const query = body.structuredQuery ?? {};
      const collectionId = (query.from?.[0]?.collectionId ?? "") as string;
      const filters = (query.where?.compositeFilter?.filters ?? []) as Array<{
        fieldFilter: Record<string, unknown>;
      }>;

      return this.json(
        this.sortAndLimit(
          this.matches(
            collectionId,
            filters.map((filter) => filter.fieldFilter),
          ),
          query,
        ).map(([path, fields]) => ({
          document: {
            name: `${DOCUMENTS_BASE}/${path}`,
            fields: encodeFirestoreFields(fields),
            createTime: fields.created,
            updateTime: fields.updated,
          },
        })),
      );
    }

    if (url === `${DOCUMENTS_BASE}:runAggregationQuery`) {
      const query = body.structuredAggregationQuery?.structuredQuery ?? {};
      const collectionId = (query.from?.[0]?.collectionId ?? "") as string;
      const filters = (query.where?.compositeFilter?.filters ?? []) as Array<{
        fieldFilter: Record<string, unknown>;
      }>;
      const rows = this.sortAndLimit(
        this.matches(
          collectionId,
          filters.map((filter) => filter.fieldFilter),
        ),
        query,
      );

      return this.json([
        {
          result: { aggregateFields: { total: { integerValue: String(rows.length) } } },
        },
      ]);
    }

    if (url === `${DOCUMENTS_BASE}:commit`) {
      const writes = (body.writes ?? []) as WriteBody[];

      for (const write of writes) {
        if (write.update && write.currentDocument?.exists === false) {
          const path = pathFromName(write.update.name);

          if (this.docs.has(path)) {
            return this.json(
              { error: { code: 409, status: "ALREADY_EXISTS", message: "exists" } },
              409,
            );
          }
        }
      }

      const nextDocs = new Map(
        [...this.docs.entries()].map(([path, fields]) => [path, { ...fields }]),
      );

      for (const write of writes) {
        if (write.delete) {
          nextDocs.delete(pathFromName(write.delete));
          continue;
        }

        if (write.transform) {
          const path = pathFromName(write.transform.document);
          const fields = nextDocs.get(path) ?? {};
          this.applyTransforms(fields, write.transform.fieldTransforms);
          nextDocs.set(path, fields);
          continue;
        }

        if (write.update) {
          const path = pathFromName(write.update.name);
          const patch = decodeFirestoreFields(write.update.fields ?? {});
          const existing = nextDocs.get(path);

          if (write.currentDocument?.exists === false || !existing) {
            const created = this.nextTimestamp();
            nextDocs.set(path, { created, updated: created, ...patch });
          } else {
            const masked = write.updateMask?.fieldPaths;

            if (masked) {
              for (const field of masked) {
                if (field in patch) {
                  existing[field] = patch[field];
                }
              }
            } else {
              Object.assign(existing, patch);
            }
          }

          const fields = nextDocs.get(path);

          if (fields) {
            this.applyTransforms(fields, write.updateTransforms);
          }
        }
      }

      this.docs = nextDocs;
      return this.json({
        writeResults: writes.map(() => ({ updateTime: this.nextTimestamp() })),
      });
    }

    const path = pathFromName(url);
    return this.docResponse(path);
  }
}

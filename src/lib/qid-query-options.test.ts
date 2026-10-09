import { deepStrictEqual, ok, strictEqual } from "node:assert/strict";
import { test } from "node:test";
import { QueryClient } from "@tanstack/react-query";
import { environmentManager, QueryObserver, timeoutManager } from "@tanstack/query-core";
import type { ManagedTimerId, TimeoutCallback } from "@tanstack/query-core";
import { qidsQueryOptions } from "./sla-data";
import type { QidRow } from "./sla-data";
import { qidsFilterSchema } from "./data.fn";

type Snapshot = { readonly rows: QidRow[]; readonly requestStartedAt: number };
type QidQueryKey = (string | Parameters<typeof qidsQueryOptions>[0])[];

test("GET accepts optional SLA and preserves unrelated detection filters", () => {
  const input = {
    sla: { mode: "next", days: 7 },
    statuses: ["Fixed", "Active"],
    yearScope: "all",
    team: "Cloud",
  };
  const parsed = qidsFilterSchema.parse(input);
  deepStrictEqual(parsed, { ...input, tags: [] });
  deepStrictEqual(qidsFilterSchema.parse({ ...input, sla: { mode: "within" } }), {
    ...input,
    sla: { mode: "within" },
    tags: [],
  });
  strictEqual(qidsFilterSchema.parse({}).sla, undefined);
});
test("GET rejects proximity without days and unsupported all mode", () => {
  const inputs = [{ sla: { mode: "next" } }, { sla: { mode: "all" } }];
  const results = inputs.map((input) => qidsFilterSchema.safeParse(input).success);
  deepStrictEqual(results, [false, false]);
});
test("QID query key includes SLA filters without a browser calendar key", () => {
  const filters = { sla: { mode: "next", days: 7 } } as const;
  const options = qidsQueryOptions(filters);
  deepStrictEqual(options.queryKey, ["qids", filters]);
});
test("QID queries refresh on mount and focus even when already cached", () => {
  const options = qidsQueryOptions({});
  deepStrictEqual(
    [
      options.staleTime,
      options.refetchOnMount,
      options.refetchOnWindowFocus,
      options.refetchIntervalInBackground,
    ],
    [0, true, true, true],
  );
});
test("QID interval recomputes the next UTC midnight with a one-second minimum", (context) => {
  const client = new QueryClient();
  const options = qidsQueryOptions({});
  const query = client.getQueryCache().build<Snapshot, Error, Snapshot, QidQueryKey>(client, {
    queryKey: ["qids", {}],
  });
  const clock = context.mock.method(Date, "now", () => Date.UTC(2026, 11, 31, 23, 59, 58));
  const interval = options.refetchInterval;
  if (typeof interval !== "function") throw new TypeError("Expected a dynamic refetch interval");
  strictEqual(interval(query), 2000);
  clock.mock.mockImplementation(() => Date.UTC(2026, 11, 31, 23, 59, 59, 999));
  strictEqual(interval(query), 1000);
  clock.mock.mockImplementation(() => Date.UTC(2027, 0, 1));
  strictEqual(interval(query), 86400000);
});

const row: QidRow = {
  qid: 123,
  title: "Original server row",
  sev: "Crítica",
  team: "Cloud",
  action: "Patch",
  count: 3,
  corr: 1,
  naoCorr: 2,
  age: 14,
  solution: "Server solution",
  status: "Active",
  sla: {
    state: "open",
    thresholdDays: 30,
    lastFoundDate: "2026-12-01",
    dueDate: "2026-12-31",
    daysRemaining: 0,
    asOfDate: "2026-12-31",
  },
};

for (const rows of [[], [row]] satisfies QidRow[][]) {
  test(`refreshes ${rows.length ? "nonempty" : "empty"} results when an earlier-day request settles after midnight`, async (context) => {
    let now = Date.UTC(2026, 11, 31, 23, 59, 59, 500);
    context.mock.method(Date, "now", () => now);
    context.mock.method(environmentManager, "isServer", () => false);
    const timers = new Map<ManagedTimerId, { callback: TimeoutCallback; delay: number }>();
    let timerId = 0;
    context.mock.method(
      timeoutManager,
      "setInterval",
      (callback: TimeoutCallback, delay: number) => {
        const id = ++timerId;
        timers.set(id, { callback, delay });
        return id;
      },
    );
    context.mock.method(timeoutManager, "clearInterval", (id: ManagedTimerId | undefined) => {
      if (id !== undefined) timers.delete(id);
    });
    const requests: { resolve: (value: QidRow[]) => void }[] = [];
    const loadRows = () => new Promise<QidRow[]>((resolve) => requests.push({ resolve }));
    const client = new QueryClient({
      defaultOptions: { queries: { gcTime: Infinity, retry: false } },
    });
    const observer = new QueryObserver<Snapshot, Error, QidRow[], Snapshot, QidQueryKey>(
      client,
      qidsQueryOptions({ sla: { mode: "due-today" } }, loadRows),
    );
    context.after(() => {
      observer.destroy();
      client.clear();
    });
    observer.subscribe(() => {});
    const query = observer.getCurrentQuery();
    const first = requests[0];
    const firstSettled = query.promise;
    ok(first && firstSettled);
    strictEqual(query.state.fetchStatus, "fetching");

    now = Date.UTC(2027, 0, 1, 0, 0, 0, 200);
    first.resolve(rows);
    await firstSettled;

    strictEqual(query.state.fetchStatus, "idle");
    strictEqual(query.state.data?.requestStartedAt, Date.UTC(2026, 11, 31, 23, 59, 59, 500));
    deepStrictEqual(observer.getCurrentResult().data, rows);
    strictEqual(timers.size, 1);
    const imminent = [...timers.values()][0];
    ok(imminent);
    strictEqual(imminent.delay, 1000);

    now = Date.UTC(2027, 0, 1, 0, 0, 1, 200);
    imminent.callback();
    const second = requests[1];
    const secondSettled = query.promise;
    ok(second && secondSettled);
    strictEqual(query.state.fetchStatus, "fetching");
    deepStrictEqual(observer.getCurrentResult().data, rows);
    const refreshedRows = rows.map((original) => ({
      ...original,
      sla: { ...original.sla, asOfDate: "2027-01-01", daysRemaining: -1 },
    }));
    second.resolve(refreshedRows);
    await secondSettled;

    strictEqual(query.state.fetchStatus, "idle");
    strictEqual(query.state.data?.requestStartedAt, now);
    deepStrictEqual(observer.getCurrentResult().data, refreshedRows);
    strictEqual(timers.size, 1);
    strictEqual([...timers.values()][0]?.delay, 86398800);
  });
}

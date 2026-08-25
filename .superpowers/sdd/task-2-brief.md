# Task 2: Expose server functions and query options

**Goal:** Wire the new backend functions from Task 1 into the client layer.

**Files to modify:**

- `src/lib/data.fn.ts`
- `src/lib/sla-data.ts`

**Changes to `src/lib/data.fn.ts`:**

1. Extend `qidsFilterSchema`:

```ts
const qidsFilterSchema = z.object({
  sev: z.string().optional(),
  team: z.string().optional(),
  q: z.string().optional(),
  tagFilter: tagFilterSchema,
  categories: z.array(z.string()).optional(),
  statuses: z.array(z.string()).optional(),
});
```

2. Add after `fetchReports`:

```ts
const statsFilterSchema = z.object({
  team: z.string().optional(),
  tagFilter: tagFilterSchema,
  categories: z.array(z.string()).optional(),
  statuses: z.array(z.string()).optional(),
  q: z.string().optional(),
});

export const fetchVulnerabilityStats = createServerFn({ method: "GET" })
  .validator(statsFilterSchema)
  .handler(async ({ data }) => {
    const { getVulnerabilityStats } = await import("../server/queries.server");
    return await getVulnerabilityStats(data);
  });
```

**Changes to `src/lib/sla-data.ts`:**

1. Import `fetchVulnerabilityStats` from `./data.fn`.

2. Add type:

```ts
export type VulnerabilityStats = {
  total: number;
  critical: number;
  criticalPatchable: number;
  cisaKev: number;
  ransomware: number;
};
```

3. Update `QidRow` type to include `status: string;`.

4. Update `qidsQueryOptions` filters type:

```ts
export const qidsQueryOptions = (filters: {
  sev?: string;
  team?: string;
  q?: string;
  tagFilter?: TagFilter | undefined;
  categories?: string[];
  statuses?: string[];
}) =>
  queryOptions({
    queryKey: ["qids", filters],
    queryFn: () => fetchQids({ data: filters }),
  });
```

5. Add:

```ts
export const vulnerabilityStatsQueryOptions = (filters: {
  team?: string;
  tagFilter?: TagFilter | undefined;
  categories?: string[];
  statuses?: string[];
  q?: string;
}) =>
  queryOptions({
    queryKey: ["vulnerability-stats", filters],
    queryFn: () => fetchVulnerabilityStats({ data: filters }),
  });
```

**Verification:**

- Run `bun run build` and ensure it succeeds.

**Report file:** `.superpowers/sdd/task-2-report.md`

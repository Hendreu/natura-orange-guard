import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { SEVERITY_ORDER } from "@/lib/constants";
import { qidSlaFilterSchema } from "@/lib/qid-sla";

const tagsSchema = z.array(z.coerce.number()).default([]);

export const fetchTeamData = createServerFn({ method: "GET" })
  .validator(z.object({ team: z.string(), tags: tagsSchema, yearScope: z.string().optional() }))
  .handler(async ({ data }) => {
    const { getTeamData } = await import("../server/queries.server");
    return await getTeamData(data);
  });

export const fetchOverview = createServerFn({ method: "GET" })
  .validator(z.object({ tags: tagsSchema }))
  .handler(async ({ data }) => {
    const { getOverview } = await import("../server/queries.server");
    return await getOverview(data);
  });

export const fetchAllTeamsData = createServerFn({ method: "GET" })
  .validator(z.object({ yearScope: z.string().optional() }))
  .handler(async ({ data }) => {
    const { getAllTeamsData } = await import("../server/queries.server");
    return await getAllTeamsData(data);
  });

export const qidsFilterSchema = z.object({
  sla: qidSlaFilterSchema.optional(),
  sev: z.array(z.string()).optional(),
  team: z.string().optional(),
  q: z.string().optional(),
  tags: tagsSchema,
  categories: z.array(z.string()).optional(),
  statuses: z.array(z.string()).optional(),
  yearScope: z.string().optional(),
});

export const fetchQids = createServerFn({ method: "GET" })
  .validator(qidsFilterSchema)
  .handler(async ({ data }) => {
    const { getQids } = await import("../server/queries.server");
    return await getQids(data);
  });

export const qidAssetsInputSchema = z.object({
  row: z.object({
    qid: z.number().finite().int().positive(),
    team: z.string(),
    action: z.string(),
    sev: z.enum(SEVERITY_ORDER),
  }),
  filters: z.object({
    team: z.string(),
    sev: z.array(z.string().regex(/^[1-5]$/)),
    q: z.string(),
    tags: z.array(z.number().finite().int().positive()),
    categories: z.array(z.string()),
    statuses: z.array(z.string()),
    yearScope: z.enum(["current", "slipped", "all"]),
  }),
  page: z.number().finite().int().positive(),
});

export const fetchQidAssets = createServerFn({ method: "GET" })
  .validator(qidAssetsInputSchema)
  .handler(async ({ data }) => {
    const { getQidAssets } = await import("../server/queries.server");
    return await getQidAssets(data);
  });

const assetsFilterSchema = z.object({
  team: z.string().optional(),
  q: z.string().optional(),
  tags: tagsSchema,
  yearScope: z.string().optional(),
});

export const fetchAssets = createServerFn({ method: "GET" })
  .validator(assetsFilterSchema)
  .handler(async ({ data }) => {
    const { getAssets } = await import("../server/queries.server");
    return await getAssets(data);
  });

export const fetchHardening = createServerFn({ method: "GET" })
  .validator(z.object({ tags: tagsSchema }))
  .handler(async ({ data }) => {
    const { getHardening } = await import("../server/queries.server");
    return await getHardening(data);
  });

const reportsFilterSchema = z.object({
  team: z.string().optional(),
  os: z.string().optional(),
  tags: tagsSchema,
  statuses: z.array(z.string()).optional(),
  yearScope: z.string().optional(),
});

export const fetchReports = createServerFn({ method: "GET" })
  .validator(reportsFilterSchema)
  .handler(async ({ data }) => {
    const { getReports } = await import("../server/queries.server");
    return await getReports(data);
  });

const statsFilterSchema = z.object({
  team: z.string().optional(),
  tags: tagsSchema,
  categories: z.array(z.string()).optional(),
  statuses: z.array(z.string()).optional(),
  q: z.string().optional(),
  yearScope: z.string().optional(),
});

export const fetchVulnerabilityStats = createServerFn({ method: "GET" })
  .validator(statsFilterSchema)
  .handler(async ({ data }) => {
    const { getVulnerabilityStats } = await import("../server/queries.server");
    return await getVulnerabilityStats(data);
  });

export const fetchLastSync = createServerFn({ method: "GET" }).handler(async () => {
  const { getLastSync } = await import("../server/queries.server");
  return await getLastSync();
});

export const fetchTags = createServerFn({ method: "GET" }).handler(async () => {
  const { getTags } = await import("../server/queries.server");
  return await getTags();
});

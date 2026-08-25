import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const tagFilterSchema = z.enum(["full", "full-cloud", "full-on-premise"]).optional();

export const fetchTeamData = createServerFn({ method: "GET" })
  .validator(z.object({ team: z.string(), tagFilter: tagFilterSchema }))
  .handler(async ({ data }) => {
    const { getTeamData } = await import("../server/queries.server");
    return await getTeamData(data);
  });

export const fetchOverview = createServerFn({ method: "GET" })
  .validator(z.object({ tagFilter: tagFilterSchema }))
  .handler(async ({ data }) => {
    const { getOverview } = await import("../server/queries.server");
    return await getOverview(data);
  });

export const fetchAllTeamsData = createServerFn({ method: "GET" }).handler(async () => {
  const { getAllTeamsData } = await import("../server/queries.server");
  return await getAllTeamsData();
});

const qidsFilterSchema = z.object({
  sev: z.array(z.string()).optional(),
  team: z.string().optional(),
  q: z.string().optional(),
  tagFilter: tagFilterSchema,
  categories: z.array(z.string()).optional(),
  statuses: z.array(z.string()).optional(),
});

export const fetchQids = createServerFn({ method: "GET" })
  .validator(qidsFilterSchema)
  .handler(async ({ data }) => {
    const { getQids } = await import("../server/queries.server");
    return await getQids(data);
  });

const assetsFilterSchema = z.object({
  team: z.string().optional(),
  q: z.string().optional(),
  tagFilter: tagFilterSchema,
});

export const fetchAssets = createServerFn({ method: "GET" })
  .validator(assetsFilterSchema)
  .handler(async ({ data }) => {
    const { getAssets } = await import("../server/queries.server");
    return await getAssets(data);
  });

export const fetchHardening = createServerFn({ method: "GET" }).handler(async () => {
  const { getHardening } = await import("../server/queries.server");
  return await getHardening();
});

const reportsFilterSchema = z.object({
  team: z.string().optional(),
  os: z.string().optional(),
  tagFilter: tagFilterSchema,
});

export const fetchReports = createServerFn({ method: "GET" })
  .validator(reportsFilterSchema)
  .handler(async ({ data }) => {
    const { getReports } = await import("../server/queries.server");
    return await getReports(data);
  });

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

export const fetchLastSync = createServerFn({ method: "GET" }).handler(async () => {
  const { getLastSync } = await import("../server/queries.server");
  return await getLastSync();
});

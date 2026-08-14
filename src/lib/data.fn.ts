import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const tagFilterSchema = z.enum(["full", "full-cloud", "full-on-premise"]).optional();

export const fetchTeamData = createServerFn({ method: "GET" })
  .validator(z.object({ team: z.string(), tagFilter: tagFilterSchema }))
  .handler(async ({ data }) => {
    const { getTeamData } = await import("../server/queries.server");
    return await getTeamData(data);
  });

export const fetchAllTeamsData = createServerFn({ method: "GET" }).handler(async () => {
  const { getAllTeamsData } = await import("../server/queries.server");
  return await getAllTeamsData();
});

const qidsFilterSchema = z.object({
  sev: z.string().optional(),
  team: z.string().optional(),
  q: z.string().optional(),
  tagFilter: tagFilterSchema,
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

UPDATE "All_Assets" SET is_cloud = NULL;

DROP MATERIALIZED VIEW IF EXISTS mv_asset_cloud;

CREATE MATERIALIZED VIEW mv_asset_cloud AS
WITH RECURSIVE cloud_tree AS (
  SELECT id FROM tags WHERE LOWER(name) = 'times:cloud'
  UNION ALL
  SELECT t.id FROM tags t JOIN cloud_tree ON t.parent_tag_id = cloud_tree.id
),
easm_tags AS (
  SELECT id FROM tags WHERE LOWER(name) IN ('times:easm', 'type: easm', 'easm', 'internet facing assets')
),
asset_cloud AS (
  SELECT DISTINCT at.asset_id
  FROM asset_tags at
  JOIN cloud_tree ct ON ct.id = at.tag_id
  UNION
  SELECT DISTINCT at.asset_id
  FROM asset_tags at
  JOIN easm_tags et ON et.id = at.tag_id
)
SELECT a."ID" AS asset_id,
  EXISTS (SELECT 1 FROM asset_cloud ac WHERE ac.asset_id = a."ID") AS is_cloud
FROM "All_Assets" a;

CREATE UNIQUE INDEX idx_mv_asset_cloud_asset_id ON mv_asset_cloud(asset_id);
CREATE INDEX idx_mv_asset_cloud_is_cloud ON mv_asset_cloud(is_cloud);

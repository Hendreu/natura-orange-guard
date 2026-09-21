CREATE TABLE IF NOT EXISTS asset_tags (
  asset_id BIGINT NOT NULL,
  tag_id   BIGINT NOT NULL,
  PRIMARY KEY (asset_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_asset_tags_tag ON asset_tags(tag_id);

ALTER TABLE asset_tags
  ADD CONSTRAINT fk_asset_tags_asset FOREIGN KEY (asset_id) REFERENCES "All_Assets"("ID") ON DELETE CASCADE,
  ADD CONSTRAINT fk_asset_tags_tag FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE;

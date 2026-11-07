-- Adds pin-drop location support to paddocks, as an alternative to drawing
-- a full boundary. Purely additive — two new nullable columns — so it can't
-- break any existing paddock, boundary, or the list_paddocks_with_boundary
-- function (the app reads these two columns with a separate query rather
-- than depending on that function returning them).
ALTER TABLE paddocks
  ADD COLUMN IF NOT EXISTS pin_lat double precision,
  ADD COLUMN IF NOT EXISTS pin_lon double precision;

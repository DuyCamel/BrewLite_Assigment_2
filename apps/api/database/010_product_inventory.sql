-- Product availability is derived only from ingredient recipes and ingredient stock.
ALTER TABLE products
  DROP COLUMN IF EXISTS stock;

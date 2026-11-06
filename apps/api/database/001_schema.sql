-- BrewLite database schema and all non-seed migrations.

-- ===== 001_schema.sql =====

-- TV1: Schema Ä‘á»§ cháº¡y menu. Cháº¡y báº±ng npm run db:migrate, KHÃ”NG xÃ³a DB cÃ³ sáºµn.
CREATE TABLE IF NOT EXISTS products (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL,
 price INTEGER NOT NULL CHECK (price >= 0), description TEXT NOT NULL DEFAULT '',
 badge TEXT NOT NULL DEFAULT '', image_url TEXT,
 stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0), version INTEGER NOT NULL DEFAULT 0,
 sizes JSONB NOT NULL DEFAULT '[]', toppings JSONB NOT NULL DEFAULT '[]',
 position INTEGER NOT NULL DEFAULT 0
);

-- Schema chung cho 6 thÃ nh viÃªn. KhÃ´ng DROP database/báº£ng; tÆ°Æ¡ng thÃ­ch báº£ng products cÅ©.
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY,
 email TEXT NOT NULL CHECK (email = btrim(email) AND position('@' IN email) > 1),
 password_hash TEXT NOT NULL CHECK (password_hash ~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$'),
 display_name TEXT NOT NULL CHECK (length(btrim(display_name)) > 0),
 loyalty_points INTEGER NOT NULL DEFAULT 0 CHECK (loyalty_points >= 0),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique ON users (lower(email));
CREATE TABLE IF NOT EXISTS promotions (
 id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE CHECK (code = upper(btrim(code)) AND length(code) > 0),
 type TEXT NOT NULL CHECK (type IN ('PERCENT','FIXED')),
 value INTEGER NOT NULL CHECK (value > 0 AND (type <> 'PERCENT' OR value <= 100)),
 minimum_amount INTEGER NOT NULL DEFAULT 0 CHECK (minimum_amount >= 0),
 active BOOLEAN NOT NULL DEFAULT true,
 starts_at TIMESTAMPTZ NOT NULL, ends_at TIMESTAMPTZ NOT NULL CHECK (ends_at > starts_at)
);
CREATE TABLE IF NOT EXISTS orders (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PAYMENT_FAILED','PAID','PREPARING','READY','COMPLETED','CANCELLED')),
 subtotal INTEGER NOT NULL CHECK (subtotal >= 0),
 discount INTEGER NOT NULL DEFAULT 0 CHECK (discount >= 0 AND discount <= subtotal),
 total INTEGER NOT NULL CHECK (total >= 0 AND total = subtotal - discount),
 promotion_id TEXT REFERENCES promotions(id) ON DELETE RESTRICT,
 stock_released BOOLEAN NOT NULL DEFAULT false,
 created_txid BIGINT NOT NULL DEFAULT txid_current(), -- chá»‰ thÃªm chi tiáº¿t trong transaction táº¡o Ä‘Æ¡n
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '15 minutes'),
 CHECK (expires_at > created_at), CHECK (promotion_id IS NOT NULL OR discount = 0)
);
CREATE TABLE IF NOT EXISTS order_items (
 id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
 product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
 product_name TEXT NOT NULL, size TEXT NOT NULL CHECK (size IN ('S','M','L')),
 topping_ids JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(topping_ids) = 'array'),
 quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 99),
 unit_price INTEGER NOT NULL CHECK (unit_price >= 0),
 line_total INTEGER NOT NULL CHECK (line_total >= 0 AND line_total::bigint = unit_price::bigint * quantity)
);
CREATE TABLE IF NOT EXISTS payments (
 id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
 idempotency_key TEXT NOT NULL UNIQUE CHECK (length(btrim(idempotency_key)) > 0),
 payload_hash TEXT NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
 amount INTEGER NOT NULL CHECK (amount >= 0),
 method TEXT NOT NULL CHECK (method IN ('WALLET','CARD')),
 status TEXT NOT NULL DEFAULT 'PROCESSING' CHECK (status IN ('PROCESSING','SUCCEEDED','FAILED')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), resolved_at TIMESTAMPTZ,
 CHECK (resolved_at IS NULL OR resolved_at >= created_at),
 CHECK ((status = 'PROCESSING' AND resolved_at IS NULL) OR (status <> 'PROCESSING' AND resolved_at IS NOT NULL))
);
-- Má»™t Ä‘Æ¡n chá»‰ cÃ³ tá»‘i Ä‘a má»™t attempt Ä‘ang xá»­ lÃ½ HOáº¶C thÃ nh cÃ´ng.
CREATE UNIQUE INDEX IF NOT EXISTS payments_one_live_attempt ON payments(order_id)
 WHERE status IN ('PROCESSING','SUCCEEDED');
CREATE TABLE IF NOT EXISTS loyalty_transactions (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
 type TEXT NOT NULL DEFAULT 'EARN' CHECK (type = 'EARN'),
 points INTEGER NOT NULL CHECK (points >= 0), created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(order_id, type)
);
CREATE INDEX IF NOT EXISTS orders_user_history ON orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_expiry ON orders(expires_at) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS payments_order_history ON payments(order_id, created_at DESC);

CREATE TABLE IF NOT EXISTS seed_history (name TEXT PRIMARY KEY, seeded_at TIMESTAMPTZ NOT NULL DEFAULT now());

-- ===== 002_integrity.sql =====

-- Kiá»ƒm tra á»Ÿ DATABASE. Service váº«n pháº£i validate/JWT/quyá»n sá»Ÿ há»¯u vÃ  Ä‘iá»u phá»‘i transaction.
-- KhÃ´ng gá»i gateway, khÃ´ng tá»± giá»¯/hoÃ n tá»“n vÃ  khÃ´ng tá»± Ä‘Ã¡nh dáº¥u PAID á»Ÿ trigger.
CREATE OR REPLACE FUNCTION check_product_options() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE item jsonb;
BEGIN
 IF btrim(NEW.name) = '' OR btrim(NEW.category) = '' THEN
  RAISE EXCEPTION 'TÃªn vÃ  loáº¡i sáº£n pháº©m khÃ´ng Ä‘Æ°á»£c rá»—ng' USING ERRCODE='23514';
 END IF;
 IF jsonb_typeof(NEW.sizes) <> 'array' OR jsonb_array_length(NEW.sizes) = 0 OR jsonb_typeof(NEW.toppings) <> 'array' THEN
  RAISE EXCEPTION 'sizes/toppings pháº£i lÃ  máº£ng, sizes khÃ´ng rá»—ng' USING ERRCODE='23514';
 END IF;
 FOR item IN SELECT * FROM jsonb_array_elements(NEW.sizes) LOOP
  IF NOT (item ? 'name' AND item ? 'extraPrice') OR NOT coalesce(item->>'name' IN ('S','M','L'),false) OR
   jsonb_typeof(item->'extraPrice') IS DISTINCT FROM 'number' OR NOT ((item->>'extraPrice') ~ '^[0-9]+$') THEN
   RAISE EXCEPTION 'Size hoáº·c giÃ¡ cá»™ng thÃªm khÃ´ng há»£p lá»‡' USING ERRCODE='23514';
  END IF;
 END LOOP;
 IF (SELECT count(*) <> count(DISTINCT x->>'name') FROM jsonb_array_elements(NEW.sizes) x) THEN
  RAISE EXCEPTION 'Size bá»‹ trÃ¹ng' USING ERRCODE='23514';
 END IF;
 FOR item IN SELECT * FROM jsonb_array_elements(NEW.toppings) LOOP
  IF NOT (item ? 'id' AND item ? 'name' AND item ? 'price') OR coalesce(btrim(item->>'id'),'')='' OR
   coalesce(btrim(item->>'name'),'')='' OR jsonb_typeof(item->'price') IS DISTINCT FROM 'number' OR NOT ((item->>'price') ~ '^[0-9]+$') THEN
   RAISE EXCEPTION 'Topping khÃ´ng há»£p lá»‡' USING ERRCODE='23514';
  END IF;
 END LOOP;
 IF (SELECT count(*) <> count(DISTINCT x->>'id') FROM jsonb_array_elements(NEW.toppings) x) THEN
  RAISE EXCEPTION 'MÃ£ topping bá»‹ trÃ¹ng' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS products_options_guard ON products;
CREATE TRIGGER products_options_guard BEFORE INSERT OR UPDATE ON products FOR EACH ROW EXECUTE FUNCTION check_product_options();

CREATE OR REPLACE FUNCTION guard_order_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.status IN ('PAID','PREPARING','READY','COMPLETED') THEN
   RAISE EXCEPTION 'KhÃ´ng xÃ³a váº­t lÃ½ Ä‘Æ¡n Ä‘Ã£ thanh toÃ¡n' USING ERRCODE='23514';
  END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.created_txid <> txid_current() THEN RAISE EXCEPTION 'created_txid pháº£i lÃ  transaction hiá»‡n táº¡i' USING ERRCODE='23514'; END IF;
  IF NEW.status <> 'PENDING' THEN RAISE EXCEPTION 'ÄÆ¡n má»›i pháº£i PENDING' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 IF NEW.created_txid IS DISTINCT FROM OLD.created_txid OR NEW.id IS DISTINCT FROM OLD.id OR NEW.user_id IS DISTINCT FROM OLD.user_id OR
  NEW.subtotal IS DISTINCT FROM OLD.subtotal OR NEW.discount IS DISTINCT FROM OLD.discount OR
  NEW.total IS DISTINCT FROM OLD.total OR NEW.promotion_id IS DISTINCT FROM OLD.promotion_id OR
  NEW.created_at IS DISTINCT FROM OLD.created_at THEN
  RAISE EXCEPTION 'KhÃ´ng sá»­a chá»§ Ä‘Æ¡n hoáº·c giÃ¡ chá»‘t; há»§y vÃ  táº¡o Ä‘Æ¡n má»›i' USING ERRCODE='23514';
 END IF;
 IF NEW.status <> OLD.status AND NOT (
  (OLD.status='PENDING' AND NEW.status IN ('PAID','PAYMENT_FAILED','CANCELLED')) OR
  (OLD.status='PAYMENT_FAILED' AND NEW.status IN ('PENDING','CANCELLED')) OR
  (OLD.status='PAID' AND NEW.status='PREPARING') OR
  (OLD.status='PREPARING' AND NEW.status='READY') OR
  (OLD.status='READY' AND NEW.status='COMPLETED')
 ) THEN RAISE EXCEPTION 'Chuyá»ƒn tráº¡ng thÃ¡i Ä‘Æ¡n khÃ´ng há»£p lá»‡: % -> %', OLD.status, NEW.status USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS orders_change_guard ON orders;
CREATE TRIGGER orders_change_guard BEFORE INSERT OR UPDATE OR DELETE ON orders FOR EACH ROW EXECUTE FUNCTION guard_order_change();

CREATE OR REPLACE FUNCTION guard_order_item() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_id text; parent_status text; parent_txid bigint; product products;
BEGIN
 parent_id := CASE WHEN TG_OP='DELETE' THEN OLD.order_id ELSE NEW.order_id END;
 SELECT status,created_txid INTO parent_status,parent_txid FROM orders WHERE id=parent_id FOR UPDATE;
 IF parent_status IS NOT NULL AND (parent_txid <> txid_current() OR EXISTS(SELECT 1 FROM payments WHERE order_id=parent_id)) THEN
  RAISE EXCEPTION 'Chi tiáº¿t Ä‘Ã£ chá»‘t; chá»‰ láº­p trong transaction táº¡o Ä‘Æ¡n trÆ°á»›c thanh toÃ¡n' USING ERRCODE='23514';
 END IF;
 IF parent_status IS NOT NULL AND parent_status <> 'PENDING' THEN
  RAISE EXCEPTION 'Chá»‰ láº­p chi tiáº¿t khi Ä‘Æ¡n PENDING' USING ERRCODE='23514';
 END IF;
 IF TG_OP='UPDATE' AND (NEW.order_id <> OLD.order_id OR NEW.id <> OLD.id) THEN
  RAISE EXCEPTION 'KhÃ´ng chuyá»ƒn chi tiáº¿t sang Ä‘Æ¡n khÃ¡c' USING ERRCODE='23514';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 SELECT * INTO product FROM products WHERE id=NEW.product_id;
 IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(product.sizes) x WHERE x->>'name'=NEW.size) THEN
  RAISE EXCEPTION 'Size khÃ´ng thuá»™c sáº£n pháº©m' USING ERRCODE='23514';
 END IF;
 IF EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.topping_ids) x
   WHERE jsonb_typeof(x) IS DISTINCT FROM 'string' OR NOT EXISTS
   (SELECT 1 FROM jsonb_array_elements(product.toppings) t WHERE t->>'id'=x#>>'{}')) THEN
  RAISE EXCEPTION 'Topping khÃ´ng thuá»™c sáº£n pháº©m' USING ERRCODE='23514';
 END IF;
 IF (SELECT count(*) <> count(DISTINCT x) FROM jsonb_array_elements(NEW.topping_ids) x) THEN
  RAISE EXCEPTION 'Topping trong dÃ²ng Ä‘Æ¡n bá»‹ trÃ¹ng' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS order_items_guard ON order_items;
CREATE TRIGGER order_items_guard BEFORE INSERT OR UPDATE OR DELETE ON order_items FOR EACH ROW EXECUTE FUNCTION guard_order_item();

CREATE OR REPLACE FUNCTION guard_payment_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent orders;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'KhÃ´ng xÃ³a lá»‹ch sá»­ thanh toÃ¡n' USING ERRCODE='23514'; END IF;
 SELECT * INTO parent FROM orders WHERE id=NEW.order_id FOR UPDATE;
 IF TG_OP='INSERT' THEN
  IF NEW.status <> 'PROCESSING' OR parent.status <> 'PENDING' THEN
   RAISE EXCEPTION 'Attempt má»›i chá»‰ PROCESSING trÃªn Ä‘Æ¡n PENDING' USING ERRCODE='23514';
  END IF;
 ELSE
  IF OLD.status <> 'PROCESSING' OR NEW.status NOT IN ('SUCCEEDED','FAILED') OR
   NEW.id IS DISTINCT FROM OLD.id OR NEW.order_id IS DISTINCT FROM OLD.order_id OR
   NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key OR NEW.payload_hash IS DISTINCT FROM OLD.payload_hash OR
   NEW.amount IS DISTINCT FROM OLD.amount OR NEW.method IS DISTINCT FROM OLD.method OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
   RAISE EXCEPTION 'KhÃ´ng sá»­a attempt cuá»‘i hoáº·c thay key/payload/sá»‘ tiá»n' USING ERRCODE='23514';
  END IF;
 END IF;
 IF NEW.amount <> parent.total THEN RAISE EXCEPTION 'Tiá»n thanh toÃ¡n khÃ¡c tá»•ng Ä‘Æ¡n' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS payments_change_guard ON payments;
CREATE TRIGGER payments_change_guard BEFORE INSERT OR UPDATE OR DELETE ON payments FOR EACH ROW EXECUTE FUNCTION guard_payment_change();

-- Kiá»ƒm tra liÃªn báº£ng táº¡i COMMIT: cho phÃ©p ghi Payment + PAID + EARN theo cÃ¹ng transaction.
CREATE OR REPLACE FUNCTION assert_order_consistency(target_id text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE o orders; lines bigint; item_count bigint; success_count bigint; processing_count bigint; earn_count bigint;
BEGIN
 SELECT * INTO o FROM orders WHERE id=target_id;
 IF NOT FOUND THEN RETURN; END IF;
 SELECT count(*),coalesce(sum(line_total),0) INTO item_count,lines FROM order_items WHERE order_id=o.id;
 IF item_count=0 OR lines<>o.subtotal THEN RAISE EXCEPTION 'ÄÆ¡n cáº§n chi tiáº¿t vÃ  subtotal pháº£i báº±ng tá»•ng dÃ²ng' USING ERRCODE='23514'; END IF;
 SELECT count(*) FILTER(WHERE status='SUCCEEDED'),count(*) FILTER(WHERE status='PROCESSING') INTO success_count,processing_count FROM payments WHERE order_id=o.id;
 IF (o.status IN ('PAID','PREPARING','READY','COMPLETED')) <> (success_count=1) THEN
  RAISE EXCEPTION 'Tráº¡ng thÃ¡i Ä‘Æ¡n khÃ´ng khá»›p thanh toÃ¡n thÃ nh cÃ´ng' USING ERRCODE='23514';
 END IF;
 SELECT count(*) INTO earn_count FROM loyalty_transactions WHERE order_id=o.id AND type='EARN';
 IF (o.status IN ('PAID','PREPARING','READY','COMPLETED')) <> (earn_count=1) THEN
  RAISE EXCEPTION 'ÄÆ¡n Ä‘Ã£ tráº£ tiá»n pháº£i cÃ³ Ä‘Ãºng má»™t EARN trong cÃ¹ng transaction' USING ERRCODE='23514';
 END IF;
 IF o.status IN ('PAYMENT_FAILED','CANCELLED') AND processing_count>0 THEN
  RAISE EXCEPTION 'KhÃ´ng há»§y/káº¿t luáº­n tháº¥t báº¡i khi cÃ²n thanh toÃ¡n PROCESSING' USING ERRCODE='23514';
 END IF;
 IF o.status='PAYMENT_FAILED' AND NOT EXISTS (SELECT 1 FROM payments WHERE order_id=o.id AND status='FAILED') THEN
  RAISE EXCEPTION 'PAYMENT_FAILED cáº§n cÃ³ attempt tháº¥t báº¡i xÃ¡c Ä‘á»‹nh' USING ERRCODE='23514';
 END IF;
 IF o.status IN ('PAYMENT_FAILED','CANCELLED') AND NOT o.stock_released THEN
  RAISE EXCEPTION 'ÄÆ¡n tháº¥t báº¡i/há»§y cáº§n Ä‘Ã¡nh dáº¥u Ä‘Ã£ hoÃ n tá»“n' USING ERRCODE='23514';
 END IF;
 IF o.status IN ('PAID','PREPARING','READY','COMPLETED') AND o.stock_released THEN
  RAISE EXCEPTION 'ÄÆ¡n Ä‘Ã£ tráº£ tiá»n khÃ´ng thá»ƒ Ä‘Ã¡nh dáº¥u Ä‘Ã£ hoÃ n tá»“n' USING ERRCODE='23514';
 END IF;
END $$;
CREATE OR REPLACE FUNCTION check_order_consistency_trigger() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='orders' THEN
  PERFORM assert_order_consistency(CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END);
 ELSE
  PERFORM assert_order_consistency(CASE WHEN TG_OP='DELETE' THEN OLD.order_id ELSE NEW.order_id END);
 END IF;
 RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS orders_consistency ON orders;
CREATE CONSTRAINT TRIGGER orders_consistency AFTER INSERT OR UPDATE ON orders DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_order_consistency_trigger();
DROP TRIGGER IF EXISTS items_consistency ON order_items;
CREATE CONSTRAINT TRIGGER items_consistency AFTER INSERT OR UPDATE OR DELETE ON order_items DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_order_consistency_trigger();
DROP TRIGGER IF EXISTS payments_consistency ON payments;
CREATE CONSTRAINT TRIGGER payments_consistency AFTER INSERT OR UPDATE OR DELETE ON payments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_order_consistency_trigger();

CREATE OR REPLACE FUNCTION guard_loyalty_earn() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE o orders;
BEGIN
 IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Sá»• Ä‘iá»ƒm chá»‰ Ä‘Æ°á»£c ghi thÃªm, khÃ´ng sá»­a/xÃ³a' USING ERRCODE='23514'; END IF;
 SELECT * INTO o FROM orders WHERE id=NEW.order_id FOR UPDATE;
 IF o.user_id IS DISTINCT FROM NEW.user_id OR o.status NOT IN ('PAID','PREPARING','READY','COMPLETED') THEN
  RAISE EXCEPTION 'Chá»‰ tÃ­ch Ä‘iá»ƒm cho chá»§ Ä‘Æ¡n Ä‘Ã£ PAID' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS loyalty_guard ON loyalty_transactions;
CREATE TRIGGER loyalty_guard BEFORE INSERT OR UPDATE OR DELETE ON loyalty_transactions FOR EACH ROW EXECUTE FUNCTION guard_loyalty_earn();
-- Äiá»ƒm tá»•ng cáº­p nháº­t bá»Ÿi trigger nÃ y; service chá»‰ INSERT ledger, KHÃ”NG cá»™ng users láº§n ná»¯a.
CREATE OR REPLACE FUNCTION add_loyalty_balance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 UPDATE users SET loyalty_points=loyalty_points+NEW.points WHERE id=NEW.user_id;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS loyalty_balance ON loyalty_transactions;
CREATE TRIGGER loyalty_balance AFTER INSERT ON loyalty_transactions FOR EACH ROW EXECUTE FUNCTION add_loyalty_balance();

-- Tá»« chá»‘i sá»­a Ä‘iá»ƒm tá»•ng khÃ´ng khá»›p sá»• Ä‘iá»ƒm (kiá»ƒm tra cuá»‘i transaction).
CREATE OR REPLACE FUNCTION check_user_points_balance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE uid text; balance bigint; ledger bigint;
BEGIN
 IF TG_TABLE_NAME='users' THEN uid:=NEW.id; ELSE uid:=NEW.user_id; END IF;
 SELECT loyalty_points INTO balance FROM users WHERE id=uid;
 SELECT coalesce(sum(points),0) INTO ledger FROM loyalty_transactions WHERE user_id=uid;
 IF balance IS DISTINCT FROM ledger THEN RAISE EXCEPTION 'Äiá»ƒm tá»•ng khÃ´ng khá»›p sá»• Ä‘iá»ƒm' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS users_points_consistency ON users;
CREATE CONSTRAINT TRIGGER users_points_consistency AFTER INSERT OR UPDATE ON users DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_user_points_balance();
DROP TRIGGER IF EXISTS ledger_points_consistency ON loyalty_transactions;
CREATE CONSTRAINT TRIGGER ledger_points_consistency AFTER INSERT ON loyalty_transactions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_user_points_balance();

-- ===== 004_sepay.sql =====

-- SePay webhook metadata. Payment state changes remain transaction-controlled by the webhook service.
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN IF NOT EXISTS provider_transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_reference TEXT,
  ADD COLUMN IF NOT EXISTS provider_payload JSONB,
  ADD COLUMN IF NOT EXISTS webhook_received_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_transaction_unique
  ON payments(provider, provider_transaction_id)
  WHERE provider_transaction_id IS NOT NULL;

-- ===== 005_ingredient_inventory.sql =====

CREATE TABLE IF NOT EXISTS ingredients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  unit TEXT NOT NULL CHECK (unit IN ('ml', 'gram', 'piece')),
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS product_recipes (
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  size TEXT NOT NULL CHECK (size IN ('S', 'M', 'L')),
  ingredient_id TEXT NOT NULL REFERENCES ingredients(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (product_id, size, ingredient_id)
);

CREATE TABLE IF NOT EXISTS topping_recipes (
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  topping_id TEXT NOT NULL,
  ingredient_id TEXT NOT NULL REFERENCES ingredients(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (product_id, topping_id, ingredient_id)
);

CREATE TABLE IF NOT EXISTS order_ingredient_reservations (
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  ingredient_id TEXT NOT NULL REFERENCES ingredients(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (order_id, ingredient_id)
);

-- Compatibility recipes let existing products migrate without silently losing stock.
-- Replace these piece-based recipes with real ml/gram recipes for the project catalog.
DO $$
DECLARE p RECORD; s TEXT; t JSONB; ingredient_id TEXT;
BEGIN
  FOR p IN SELECT id, name, stock, sizes, toppings FROM products LOOP
    INSERT INTO ingredients (id, name, unit, stock)
    VALUES ('legacy-product-' || p.id, p.name, 'piece', p.stock)
    ON CONFLICT (id) DO NOTHING;
    FOR s IN SELECT jsonb_array_elements_text(
      COALESCE((SELECT jsonb_agg(x->>'name') FROM jsonb_array_elements(p.sizes) x), '[]'::jsonb)
    ) LOOP
      INSERT INTO product_recipes(product_id, size, ingredient_id, quantity)
      VALUES (p.id, s, 'legacy-product-' || p.id, 1)
      ON CONFLICT DO NOTHING;
    END LOOP;
    FOR t IN SELECT * FROM jsonb_array_elements(p.toppings) LOOP
      ingredient_id := 'legacy-topping-' || p.id || '-' || (t->>'id');
      INSERT INTO ingredients(id, name, unit, stock)
      VALUES (ingredient_id, p.name || ' - ' || (t->>'name'), 'piece', 1000000)
      ON CONFLICT (id) DO NOTHING;
      INSERT INTO topping_recipes(product_id, topping_id, ingredient_id, quantity)
      VALUES (p.id, t->>'id', ingredient_id, 1)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
END $$;


-- ===== 008_password_reset.sql =====

-- TV3: quÃªn máº­t kháº©u. Chá»‰ lÆ°u mÃ£ bÄƒm SHA-256 cá»§a token (token gá»‘c chá»‰ náº±m trong email gá»­i cho ngÆ°á»i dÃ¹ng).
-- Token dÃ¹ng má»™t láº§n (used_at) vÃ  cÃ³ háº¡n (expires_at). XÃ³a tÃ i khoáº£n thÃ¬ xÃ³a luÃ´n token cá»§a tÃ i khoáº£n Ä‘Ã³.
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Phá»¥c vá»¥ giá»›i háº¡n sá»‘ yÃªu cáº§u theo tÃ i khoáº£n vÃ  dá»n token cÅ©.
CREATE INDEX IF NOT EXISTS password_reset_tokens_user_created
  ON password_reset_tokens (user_id, created_at DESC);


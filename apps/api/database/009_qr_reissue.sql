ALTER TABLE orders ADD COLUMN qr_expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '5 minutes');
ALTER TABLE orders ADD COLUMN qr_attempts SMALLINT NOT NULL DEFAULT 1 CHECK (qr_attempts BETWEEN 1 AND 2);
UPDATE orders SET qr_expires_at = expires_at;

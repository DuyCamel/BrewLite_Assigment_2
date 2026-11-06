CREATE SEQUENCE orders_payment_code_seq START 1 MAXVALUE 99999999;

ALTER TABLE orders ADD COLUMN payment_code TEXT;
UPDATE orders
SET payment_code = 'DH' || lpad(nextval('orders_payment_code_seq')::text, 8, '0');
ALTER TABLE orders
  ALTER COLUMN payment_code SET DEFAULT ('DH' || lpad(nextval('orders_payment_code_seq')::text, 8, '0')),
  ALTER COLUMN payment_code SET NOT NULL,
  ADD CONSTRAINT orders_payment_code_format CHECK (payment_code ~ '^DH[0-9]{8}$'),
  ADD CONSTRAINT orders_payment_code_unique UNIQUE (payment_code);

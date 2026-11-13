-- Accept the SePay method already exposed by the payment API and checkout UI.
ALTER TABLE payments
  DROP CONSTRAINT payments_method_check,
  ADD CONSTRAINT payments_method_check CHECK (method IN ('WALLET', 'CARD', 'SEPAY'));

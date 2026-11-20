INSERT INTO api.orders (reference, status, amount_cents)
VALUES ('LAB-1004', 'paid', 3190)
RETURNING reference, status, amount_cents, created_at;

BEGIN;

DELETE FROM api.orders
WHERE reference IN ('LAB-1002', 'LAB-1003')
RETURNING reference, status, amount_cents, created_at;

COMMIT;

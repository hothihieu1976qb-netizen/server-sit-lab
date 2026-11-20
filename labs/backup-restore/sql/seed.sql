CREATE SCHEMA api;

CREATE TABLE api.orders (
    reference text PRIMARY KEY,
    status text NOT NULL CHECK (status IN ('paid', 'ready', 'shipped')),
    amount_cents integer NOT NULL CHECK (amount_cents > 0),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

GRANT USAGE ON SCHEMA api TO lab_reader;
GRANT SELECT ON api.orders TO lab_reader;

INSERT INTO api.orders (reference, status, amount_cents) VALUES
    ('LAB-1001', 'paid', 2590),
    ('LAB-1002', 'ready', 4990),
    ('LAB-1003', 'shipped', 8990);

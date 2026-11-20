CREATE ROLE lab_reader NOLOGIN;
CREATE ROLE lab_api LOGIN NOINHERIT PASSWORD 'lab-api-only';
GRANT lab_reader TO lab_api;

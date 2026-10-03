-- Runs once, when the Postgres volume is first created.
-- A separate database for API integration tests, so tests never touch dev data.
CREATE DATABASE optical_test OWNER optical;

BEGIN;
CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)));
CREATE TABLE items (id INTEGER PRIMARY KEY, owner_id INTEGER NOT NULL REFERENCES users(id), title TEXT NOT NULL);
CREATE INDEX items_owner_id ON items(owner_id, id);
INSERT INTO users VALUES (1, 'Demo user', 1), (2, 'Other user', 1);
INSERT INTO items VALUES (1, 1, 'Verify the generated workspace'), (2, 1, 'Read the effective HTTP convention'), (3, 1, 'Check logout revocation'), (4, 2, 'Other owner private item');
PRAGMA user_version = 1;
COMMIT;

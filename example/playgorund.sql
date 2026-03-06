
ROLLBACK;


DROP TABLE IF EXISTS migration_history;


CREATE TABLE migration_history (id SERIAL PRIMARY KEY,
                                          description TEXT, type TEXT, script TEXT);


INSERT INTO migration_history (description, type, script)
VALUES ('Initial migration', 'SQL', 'V1__initial_migration.sql');


INSERT INTO migration_history (description, type, script)
VALUES ('Add users table', 'SQL', 'V2__add_users_table.sql');


INSERT INTO migration_history (description, type, script)
VALUES ('Add orders table', 'SQL', 'V3__add_orders_table.sql');


CREATE OR REPLACE PROCEDURE list_migration_history() AS $$
DECLARE
    list_migration_history_cursor REFCURSOR := 'list_migration_history_cursor';
BEGIN
    OPEN list_migration_history_cursor FOR
        SELECT description, type, script
        FROM migration_history;
END;
$$ LANGUAGE plpgsql;

BEGIN;

CALL list_migration_history();

FETCH ALL
FROM "list_migration_history_cursor";


COMMIT;
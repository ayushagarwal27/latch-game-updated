/**
 * Minimal SQL migration runner.
 *
 * How it works:
 *   - Keeps a `schema_migrations` table that records every applied file.
 *   - On startup, reads every *.sql file in ./migrations/, sorted by name.
 *   - Skips files already recorded; runs the rest in order, each inside its
 *     own transaction so a failing migration rolls back cleanly.
 *
 * Naming convention for migration files:
 *   001_create_users.sql
 *   002_add_username_index.sql
 *   003_add_avatar_column.sql
 *   ...
 * Always prefix with a zero-padded number so they sort correctly.
 */

const fs   = require("fs");
const path = require("path");

const MIGRATIONS_DIR = path.join(__dirname, "migrations");

async function migrate(pool) {
  // Ensure the tracking table exists (this is the only schema change we ever
  // run outside a migration file — it must exist before we can track anything).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id         SERIAL       PRIMARY KEY,
      filename   VARCHAR(255) UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ  DEFAULT NOW()
    )
  `);

  // Collect and sort migration files.
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort(); // lexicographic sort — works as long as filenames are zero-padded

  if (!files.length) {
    console.log("migrate: no migration files found");
    return;
  }

  // Fetch already-applied migrations in one query.
  const { rows } = await pool.query("SELECT filename FROM schema_migrations");
  const applied  = new Set(rows.map((r) => r.filename));

  for (const file of files) {
    if (applied.has(file)) continue;

    const sql    = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations (filename) VALUES ($1)",
        [file]
      );
      await client.query("COMMIT");
      console.log(`migrate: applied ${file}`);
    } catch (err) {
      await client.query("ROLLBACK");
      throw new Error(`Migration failed (${file}): ${err.message}`);
    } finally {
      client.release();
    }
  }

  console.log("migrate: all migrations up to date");
}

module.exports = { migrate };

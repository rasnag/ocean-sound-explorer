import {readdir, readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

/** Developer-only migration runner. Never expose supplied SQL through an endpoint. */
export async function migrate(db, options = {}) {
  const directory = new URL('./migrations/', import.meta.url);
  const migrations = options.migrations ?? await Promise.all(
    (await readdir(directory)).filter(name => /^\d+_[a-z0-9_-]+\.sql$/.test(name)).map(async name => ({
      version: Number(name.split('_')[0]), sql: await readFile(new URL(name, directory), 'utf8'), provenance: name,
    })),
  );
  if (!Array.isArray(migrations)) throw new TypeError('Migrations must be an array.');
  const seen = new Set();
  const ordered = migrations.map(item => {
    if (!Number.isSafeInteger(item.version) || item.version <= 0 || typeof item.sql !== 'string' || !item.sql.trim() || seen.has(item.version)) {
      throw new TypeError('Migration versions must be distinct positive integers with SQL content.');
    }
    seen.add(item.version);
    return {...item, checksum: createHash('sha256').update(item.sql, 'utf8').digest('hex')};
  }).sort((a, b) => a.version - b.version);
  await db.transaction(async tx => {
    await tx.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version bigint PRIMARY KEY CHECK (version > 0),
      checksum text NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
      provenance text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT current_timestamp
    ); LOCK TABLE schema_migrations IN EXCLUSIVE MODE;`);
    for (const migration of ordered) {
      const existing = await tx.query('SELECT checksum FROM schema_migrations WHERE version=$1', [migration.version]);
      if (existing.rows.length) {
        if (existing.rows[0].checksum !== migration.checksum) {
          const error = new Error(`Applied migration ${migration.version} has changed.`);
          error.code = 'MIGRATION_CHECKSUM_MISMATCH';
          throw error;
        }
        continue;
      }
      await tx.exec(migration.sql);
      await tx.query('INSERT INTO schema_migrations(version,checksum,provenance) VALUES($1,$2,$3)',
        [migration.version, migration.checksum, migration.provenance ?? 'developer-only supplied migration']);
    }
  });
}

import {resolveLoopConfig} from './environment.mjs';

/** Empty disposable PostgreSQL engine; caller owns migrations, fixtures and close(). */
export async function createSyntheticDatabase(env) {
  resolveLoopConfig(env);
  const {PGlite} = await import('@electric-sql/pglite');
  const db = new PGlite();
  try {
    await db.waitReady;
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}

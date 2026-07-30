import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getMigrations } from 'better-auth/db/migration';
import { createAuth } from './auth.mjs';
import { loadAccountConfig } from './config.mjs';
import { openAccountDatabase } from './database.mjs';

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));

export async function runAccountMigrations({ database, auth }) {
  const migrations = await getMigrations(auth.options);
  await migrations.runMigrations();

  database.exec(`
    CREATE TABLE IF NOT EXISTS emberveil_app_migration (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = database.prepare('SELECT id FROM emberveil_app_migration WHERE id = ?');
  const record = database.prepare('INSERT INTO emberveil_app_migration (id, applied_at) VALUES (?, ?)');
  const migrationFiles = fs
    .readdirSync(path.join(moduleDirectory, 'migrations'))
    .filter((name) => name.endsWith('.sql'))
    .sort();

  for (const fileName of migrationFiles) {
    if (applied.get(fileName)) continue;
    const sql = fs.readFileSync(path.join(moduleDirectory, 'migrations', fileName), 'utf8');
    database.exec('BEGIN IMMEDIATE');
    try {
      database.exec(sql);
      record.run(fileName, new Date().toISOString());
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  }
}

async function main() {
  const config = loadAccountConfig();
  const database = openAccountDatabase(config.databasePath);
  const auth = createAuth({ config, database });
  await runAccountMigrations({ database, auth });
  console.log('Account and cloud-save migrations are current.');
  database.close();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

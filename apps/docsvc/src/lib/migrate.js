import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.join(__dirname, '..', '..', 'migrations');

export async function migrate(pool) {
  let files;
  try {
    files = await readdir(migrationsDir);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return;
    }
    throw error;
  }

  const sqlFiles = files.filter((file) => file.endsWith('.sql')).sort();
  if (sqlFiles.length === 0) {
    return;
  }

  const client = await pool.connect();
  try {
    for (const file of sqlFiles) {
      const fullPath = path.join(migrationsDir, file);
      const sql = await readFile(fullPath, 'utf8');
      if (!sql.trim()) continue;
      await client.query(sql);
    }
  } finally {
    client.release();
  }
}

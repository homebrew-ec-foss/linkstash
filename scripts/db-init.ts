#!/usr/bin/env bun
import { client, initDb } from './db';

async function main(): Promise<void> {
  try {
    console.log('Initializing Turso database...');
    await initDb();
    console.log('Database initialized successfully!');

    // Test the connection
    const result = await client.execute('SELECT 1 as test');
    console.log('Database connection test:', result.rows[0]);
  } catch (error) {
    console.error('Error initializing database:', error);
    process.exit(1);
  }
}

main();
const { Pool } = require('pg');

// Настройки подключения берутся из переменных окружения,
// по умолчанию — локальный PostgreSQL.
const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'postgres',
  database: process.env.PGDATABASE || 'shop',
});

module.exports = pool;

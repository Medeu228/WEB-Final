// Создаёт таблицы и заполняет тестовыми данными: npm run init-db
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const pool = require('./db');

const products = [
  ['Смартфон Nova X', 'Экран 6.5", 128 ГБ памяти, две камеры', 189990, 15, 'Электроника', 'https://picsum.photos/seed/phone/400/300'],
  ['Беспроводные наушники', 'Шумоподавление, до 30 часов работы', 24990, 40, 'Электроника', 'https://picsum.photos/seed/headphones/400/300'],
  ['Ноутбук Air 14', '14", 16 ГБ ОЗУ, SSD 512 ГБ', 389990, 6, 'Электроника', 'https://picsum.photos/seed/laptop/400/300'],
  ['Кроссовки Run Pro', 'Лёгкие кроссовки для бега и города', 32990, 25, 'Одежда', 'https://picsum.photos/seed/shoes/400/300'],
  ['Худи оверсайз', 'Хлопок 100%, тёплое, унисекс', 14990, 30, 'Одежда', 'https://picsum.photos/seed/hoodie/400/300'],
  ['Рюкзак городской', 'Влагостойкий, отделение для ноутбука', 17990, 20, 'Аксессуары', 'https://picsum.photos/seed/backpack/400/300'],
  ['Термокружка 450 мл', 'Держит тепло до 8 часов', 6990, 60, 'Дом', 'https://picsum.photos/seed/mug/400/300'],
  ['Настольная лампа LED', 'Регулировка яркости и температуры света', 9990, 18, 'Дом', 'https://picsum.photos/seed/lamp/400/300'],
];

(async () => {
  try {
    const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
    await pool.query(schema);

    const hash = await bcrypt.hash('123456', 10);
    const seller = await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ('Магазин Medeu', 'seller@shop.kz', $1, 'seller') RETURNING id`, [hash]);
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ('Тестовый покупатель', 'buyer@shop.kz', $1, 'buyer')`, [hash]);

    for (const p of products) {
      await pool.query(
        `INSERT INTO products (seller_id, title, description, price, stock, category, image_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`, [seller.rows[0].id, ...p]);
    }
    console.log('База готова. Тестовые аккаунты (пароль 123456): seller@shop.kz, buyer@shop.kz');
  } catch (e) {
    console.error('Ошибка инициализации:', e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();

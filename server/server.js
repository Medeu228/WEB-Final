const path = require('path');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

app.use(cors());
app.use(express.json());

// ---------- вспомогательные функции ----------

const asyncRoute = (fn) => (req, res, next) => fn(req, res, next).catch(next);

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Нужно войти в аккаунт' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Сессия истекла, войдите снова' });
  }
}

const onlyRole = (role) => (req, res, next) =>
  req.user.role === role ? next() : res.status(403).json({ error: 'Недостаточно прав' });

const makeToken = (u) =>
  jwt.sign({ id: u.id, name: u.name, role: u.role }, JWT_SECRET, { expiresIn: '7d' });

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role });

// ---------- авторизация ----------

app.post('/api/auth/register', asyncRoute(async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Заполните все поля' });
  if (password.length < 6) return res.status(400).json({ error: 'Пароль минимум 6 символов' });
  if (!['buyer', 'seller'].includes(role)) return res.status(400).json({ error: 'Выберите роль' });

  const exists = await pool.query('SELECT 1 FROM users WHERE email = $1', [email.toLowerCase()]);
  if (exists.rowCount) return res.status(409).json({ error: 'Этот email уже зарегистрирован' });

  const hash = await bcrypt.hash(password, 10);
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [name.trim(), email.toLowerCase(), hash, role]);
  res.status(201).json({ token: makeToken(rows[0]), user: publicUser(rows[0]) });
}));

app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const { email, password } = req.body;
  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [(email || '').toLowerCase()]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password || '', user.password_hash))) {
    return res.status(401).json({ error: 'Неверный email или пароль' });
  }
  res.json({ token: makeToken(user), user: publicUser(user) });
}));

// ---------- товары ----------

// Каталог (публичный): ?q=поиск&category=Категория
app.get('/api/products', asyncRoute(async (req, res) => {
  const { q, category } = req.query;
  const where = ['stock > 0'];
  const params = [];
  if (q) { params.push(`%${q}%`); where.push(`(title ILIKE $${params.length} OR description ILIKE $${params.length})`); }
  if (category) { params.push(category); where.push(`category = $${params.length}`); }
  const { rows } = await pool.query(
    `SELECT * FROM products WHERE ${where.join(' AND ')} ORDER BY id DESC`, params);
  res.json(rows);
}));

app.get('/api/categories', asyncRoute(async (req, res) => {
  const { rows } = await pool.query(
    'SELECT DISTINCT category FROM products WHERE stock > 0 ORDER BY category');
  res.json(rows.map((r) => r.category));
}));

app.get('/api/products/:id', asyncRoute(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Товар не найден' });
  res.json(rows[0]);
}));

// Товары продавца (все, включая закончившиеся)
app.get('/api/seller/products', auth, onlyRole('seller'), asyncRoute(async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM products WHERE seller_id = $1 ORDER BY id DESC', [req.user.id]);
  res.json(rows);
}));

function validateProduct(b) {
  if (!b.title || !b.title.trim()) return 'Укажите название';
  if (!(Number(b.price) >= 0) || b.price === '') return 'Некорректная цена';
  if (!Number.isInteger(Number(b.stock)) || Number(b.stock) < 0) return 'Некорректное количество';
  return null;
}

app.post('/api/products', auth, onlyRole('seller'), asyncRoute(async (req, res) => {
  const err = validateProduct(req.body);
  if (err) return res.status(400).json({ error: err });
  const b = req.body;
  const { rows } = await pool.query(
    `INSERT INTO products (seller_id, title, description, price, stock, category, image_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [req.user.id, b.title.trim(), b.description || '', b.price, b.stock,
     (b.category || 'Разное').trim(), b.image_url || '']);
  res.status(201).json(rows[0]);
}));

app.put('/api/products/:id', auth, onlyRole('seller'), asyncRoute(async (req, res) => {
  const err = validateProduct(req.body);
  if (err) return res.status(400).json({ error: err });
  const b = req.body;
  const { rows } = await pool.query(
    `UPDATE products SET title=$1, description=$2, price=$3, stock=$4, category=$5, image_url=$6
     WHERE id=$7 AND seller_id=$8 RETURNING *`,
    [b.title.trim(), b.description || '', b.price, b.stock,
     (b.category || 'Разное').trim(), b.image_url || '', req.params.id, req.user.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Товар не найден' });
  res.json(rows[0]);
}));

app.delete('/api/products/:id', auth, onlyRole('seller'), asyncRoute(async (req, res) => {
  try {
    const r = await pool.query('DELETE FROM products WHERE id=$1 AND seller_id=$2', [req.params.id, req.user.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'Товар не найден' });
    res.json({ ok: true });
  } catch (e) {
    // товар уже есть в заказах — удалять нельзя, скрываем (остаток 0)
    if (e.code === '23503') {
      await pool.query('UPDATE products SET stock = 0 WHERE id=$1 AND seller_id=$2', [req.params.id, req.user.id]);
      return res.json({ ok: true, hidden: true });
    }
    throw e;
  }
}));

// ---------- заказы ----------

// Оформление заказа покупателем: { items: [{product_id, quantity}], address, phone }
app.post('/api/orders', auth, onlyRole('buyer'), asyncRoute(async (req, res) => {
  const { items, address, phone } = req.body;
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'Корзина пуста' });
  if (!address || !address.trim() || !phone || !phone.trim()) {
    return res.status(400).json({ error: 'Укажите адрес и телефон' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let total = 0;
    const lines = [];
    for (const it of items) {
      const qty = Number(it.quantity);
      if (!Number.isInteger(qty) || qty < 1) throw Object.assign(new Error('Некорректное количество'), { status: 400 });
      // FOR UPDATE — блокируем строку, чтобы два покупателя не купили последний товар одновременно
      const { rows } = await client.query('SELECT * FROM products WHERE id = $1 FOR UPDATE', [it.product_id]);
      const p = rows[0];
      if (!p) throw Object.assign(new Error('Товар не найден'), { status: 404 });
      if (p.stock < qty) throw Object.assign(new Error(`Недостаточно товара «${p.title}» (осталось ${p.stock})`), { status: 409 });
      await client.query('UPDATE products SET stock = stock - $1 WHERE id = $2', [qty, p.id]);
      total += Number(p.price) * qty;
      lines.push({ p, qty });
    }
    const order = (await client.query(
      `INSERT INTO orders (buyer_id, total, address, phone) VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.user.id, total, address.trim(), phone.trim()])).rows[0];
    for (const { p, qty } of lines) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, title, price, quantity) VALUES ($1, $2, $3, $4, $5)`,
        [order.id, p.id, p.title, p.price, qty]);
    }
    await client.query('COMMIT');
    res.status(201).json(order);
  } catch (e) {
    await client.query('ROLLBACK');
    if (e.status) return res.status(e.status).json({ error: e.message });
    throw e;
  } finally {
    client.release();
  }
}));

const ORDER_SELECT = `
  SELECT o.*, u.name AS buyer_name,
    COALESCE(json_agg(json_build_object(
      'product_id', oi.product_id, 'title', oi.title, 'price', oi.price, 'quantity', oi.quantity
    ) ORDER BY oi.id) FILTER (WHERE oi.id IS NOT NULL), '[]') AS items
  FROM orders o
  JOIN users u ON u.id = o.buyer_id
  LEFT JOIN order_items oi ON oi.order_id = o.id`;

// Заказы покупателя
app.get('/api/orders', auth, onlyRole('buyer'), asyncRoute(async (req, res) => {
  const { rows } = await pool.query(
    `${ORDER_SELECT} WHERE o.buyer_id = $1 GROUP BY o.id, u.name ORDER BY o.id DESC`, [req.user.id]);
  res.json(rows);
}));

// Заказы, где есть товары продавца
app.get('/api/seller/orders', auth, onlyRole('seller'), asyncRoute(async (req, res) => {
  const { rows } = await pool.query(
    `${ORDER_SELECT}
     WHERE o.id IN (
       SELECT oi2.order_id FROM order_items oi2
       JOIN products p ON p.id = oi2.product_id WHERE p.seller_id = $1)
     GROUP BY o.id, u.name ORDER BY o.id DESC`, [req.user.id]);
  res.json(rows);
}));

// Смена статуса заказа продавцом
app.patch('/api/orders/:id/status', auth, onlyRole('seller'), asyncRoute(async (req, res) => {
  const { status } = req.body;
  if (!['new', 'processing', 'shipped', 'delivered', 'cancelled'].includes(status)) {
    return res.status(400).json({ error: 'Неизвестный статус' });
  }
  const mine = await pool.query(
    `SELECT 1 FROM order_items oi JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id = $1 AND p.seller_id = $2 LIMIT 1`, [req.params.id, req.user.id]);
  if (!mine.rowCount) return res.status(404).json({ error: 'Заказ не найден' });
  const { rows } = await pool.query(
    'UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *', [status, req.params.id]);
  res.json(rows[0]);
}));

// ---------- статика (сайт) и обработка ошибок ----------

app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api', (req, res) => res.status(404).json({ error: 'Маршрут не найден' }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Ошибка сервера' });
});

app.listen(PORT, () => console.log(`Сервер запущен: http://localhost:${PORT}`));

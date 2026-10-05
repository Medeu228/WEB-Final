-- Схема БД интернет-магазина (PostgreSQL)
-- Общая для сайта, iOS-приложения покупателя и Android-приложения продавца

DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS users CASCADE;

CREATE TABLE users (
    id            SERIAL PRIMARY KEY,
    name          VARCHAR(100) NOT NULL,
    email         VARCHAR(150) NOT NULL UNIQUE,
    password_hash VARCHAR(100) NOT NULL,
    role          VARCHAR(10)  NOT NULL CHECK (role IN ('buyer', 'seller')),
    created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE products (
    id          SERIAL PRIMARY KEY,
    seller_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title       VARCHAR(150) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    price       NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
    stock       INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    category    VARCHAR(50) NOT NULL DEFAULT 'Разное',
    image_url   TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE orders (
    id         SERIAL PRIMARY KEY,
    buyer_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status     VARCHAR(15) NOT NULL DEFAULT 'new'
               CHECK (status IN ('new', 'processing', 'shipped', 'delivered', 'cancelled')),
    total      NUMERIC(12, 2) NOT NULL,
    address    VARCHAR(250) NOT NULL,
    phone      VARCHAR(30) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE order_items (
    id         SERIAL PRIMARY KEY,
    order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    title      VARCHAR(150) NOT NULL,   -- название на момент покупки
    price      NUMERIC(12, 2) NOT NULL, -- цена на момент покупки
    quantity   INTEGER NOT NULL CHECK (quantity > 0)
);

CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_orders_buyer ON orders(buyer_id);
CREATE INDEX idx_order_items_order ON order_items(order_id);

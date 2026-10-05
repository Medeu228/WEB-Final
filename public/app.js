// Одностраничное приложение (SPA) на чистом JS без библиотек.
// Маршрутизация через hash: #/, #/product/5, #/cart, #/orders, #/seller ...

const app = document.getElementById('app');
const nav = document.getElementById('nav');

const STATUS_LABELS = {
  new: 'Новый',
  processing: 'Собирается',
  shipped: 'В пути',
  delivered: 'Доставлен',
  cancelled: 'Отменён',
};
const STEPS = ['new', 'processing', 'shipped', 'delivered'];

// ---------- состояние: пользователь и корзина ----------

const state = {
  token: localStorage.getItem('token'),
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  cart: JSON.parse(localStorage.getItem('cart') || '[]'), // [{id, title, price, image_url, quantity}]
};

function saveSession(token, user) {
  state.token = token;
  state.user = user;
  if (token) {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
  } else {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }
}

function saveCart() {
  localStorage.setItem('cart', JSON.stringify(state.cart));
}

// ---------- утилиты ----------

// Экранирование — защита от XSS, т.к. названия товаров вводят пользователи
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const money = (n) => Number(n).toLocaleString('ru-RU', { maximumFractionDigits: 0 }) + ' ₸';
const dateStr = (s) => new Date(s).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });

let toastTimer;
function toast(text, isError = false) {
  const el = document.getElementById('toast');
  el.textContent = text;
  el.className = 'toast' + (isError ? ' err' : '');
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 2800);
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers.Authorization = 'Bearer ' + state.token;
  const res = await fetch('/api' + path, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && state.token) {
    saveSession(null, null);
    renderNav();
  }
  if (!res.ok) throw new Error(data.error || 'Ошибка запроса');
  return data;
}

function go(hash) { location.hash = hash; }

const cartCount = () => state.cart.reduce((s, i) => s + i.quantity, 0);
const cartTotal = () => state.cart.reduce((s, i) => s + i.price * i.quantity, 0);

// ---------- шапка ----------

function renderNav() {
  const u = state.user;
  let html = '';
  if (!u) {
    html = `<a href="#/">Каталог</a><a href="#/cart">Корзина${cartCount() ? `<span class="badge">${cartCount()}</span>` : ''}</a>
            <a href="#/login">Войти</a><a href="#/register">Регистрация</a>`;
  } else if (u.role === 'buyer') {
    html = `<a href="#/">Каталог</a>
            <a href="#/cart">Корзина${cartCount() ? `<span class="badge">${cartCount()}</span>` : ''}</a>
            <a href="#/orders">Мои заказы</a>
            <span class="muted">${esc(u.name)}</span><button id="logout">Выйти</button>`;
  } else {
    html = `<a href="#/seller">Панель продавца</a>
            <span class="muted">${esc(u.name)}</span><button id="logout">Выйти</button>`;
  }
  nav.innerHTML = html;
  const logout = document.getElementById('logout');
  if (logout) logout.onclick = () => { saveSession(null, null); renderNav(); go('#/'); route(); };
}

// ---------- страницы ----------

async function pageCatalog() {
  app.innerHTML = `
    <h1>Каталог</h1>
    <div class="filters">
      <input id="q" type="search" placeholder="Поиск товаров...">
      <select id="cat"><option value="">Все категории</option></select>
    </div>
    <div id="list" class="grid"></div>`;

  const catSelect = document.getElementById('cat');
  (await api('/categories')).forEach((c) => {
    const o = document.createElement('option');
    o.value = c; o.textContent = c;
    catSelect.appendChild(o);
  });

  async function load() {
    const q = document.getElementById('q').value.trim();
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (catSelect.value) params.set('category', catSelect.value);
    const products = await api('/products?' + params);
    const list = document.getElementById('list');
    if (!products.length) { list.innerHTML = '<div class="empty" style="grid-column:1/-1">Ничего не найдено</div>'; return; }
    list.innerHTML = products.map((p) => `
      <div class="product">
        <a href="#/product/${p.id}"><img src="${esc(p.image_url)}" alt="${esc(p.title)}" loading="lazy"></a>
        <div class="body">
          <span class="cat">${esc(p.category)}</span>
          <a class="title" href="#/product/${p.id}">${esc(p.title)}</a>
          <span class="price">${money(p.price)}</span>
          <button class="btn" data-add="${p.id}">В корзину</button>
        </div>
      </div>`).join('');
    list.querySelectorAll('[data-add]').forEach((b) => {
      b.onclick = () => addToCart(products.find((p) => p.id == b.dataset.add));
    });
  }

  let timer;
  document.getElementById('q').oninput = () => { clearTimeout(timer); timer = setTimeout(load, 300); };
  catSelect.onchange = load;
  await load();
}

async function pageProduct(id) {
  const p = await api('/products/' + id);
  app.innerHTML = `
    <p><a href="#/">← В каталог</a></p>
    <div class="details">
      <img src="${esc(p.image_url)}" alt="${esc(p.title)}">
      <div>
        <span class="muted">${esc(p.category)}</span>
        <h1>${esc(p.title)}</h1>
        <div class="price">${money(p.price)}</div>
        <p>${esc(p.description)}</p>
        <p class="muted">В наличии: ${p.stock} шт.</p>
        <button class="btn" id="add" ${p.stock < 1 ? 'disabled' : ''}>${p.stock < 1 ? 'Нет в наличии' : 'В корзину'}</button>
      </div>
    </div>`;
  document.getElementById('add').onclick = () => addToCart(p);
}

function addToCart(p) {
  if (state.user && state.user.role === 'seller') return toast('Продавец не может покупать товары', true);
  const item = state.cart.find((i) => i.id === p.id);
  const have = item ? item.quantity : 0;
  if (have + 1 > p.stock) return toast('Больше нет в наличии', true);
  if (item) item.quantity++;
  else state.cart.push({ id: p.id, title: p.title, price: Number(p.price), image_url: p.image_url, stock: p.stock, quantity: 1 });
  saveCart();
  renderNav();
  toast('Добавлено в корзину');
}

function pageCart() {
  if (!state.cart.length) {
    app.innerHTML = '<div class="empty"><h2>Корзина пуста</h2><a class="btn" href="#/">Перейти в каталог</a></div>';
    return;
  }
  app.innerHTML = `
    <h1>Корзина</h1>
    <div class="table-wrap"><table>
      <thead><tr><th>Товар</th><th>Цена</th><th>Кол-во</th><th>Сумма</th><th></th></tr></thead>
      <tbody>${state.cart.map((i) => `
        <tr>
          <td>${esc(i.title)}</td>
          <td>${money(i.price)}</td>
          <td><input type="number" min="1" max="${i.stock}" value="${i.quantity}" data-qty="${i.id}"></td>
          <td>${money(i.price * i.quantity)}</td>
          <td><button class="btn small danger" data-del="${i.id}">Удалить</button></td>
        </tr>`).join('')}
      </tbody>
    </table></div>
    <div class="row space" style="margin-top:16px">
      <h2>Итого: ${money(cartTotal())}</h2>
      <a class="btn" href="#/checkout">Оформить заказ</a>
    </div>`;

  app.querySelectorAll('[data-qty]').forEach((inp) => {
    inp.onchange = () => {
      const item = state.cart.find((i) => i.id == inp.dataset.qty);
      let q = parseInt(inp.value, 10);
      if (!q || q < 1) q = 1;
      if (q > item.stock) { q = item.stock; toast('Столько нет в наличии', true); }
      item.quantity = q;
      saveCart(); renderNav(); pageCart();
    };
  });
  app.querySelectorAll('[data-del]').forEach((b) => {
    b.onclick = () => {
      state.cart = state.cart.filter((i) => i.id != b.dataset.del);
      saveCart(); renderNav(); pageCart();
    };
  });
}

function pageCheckout() {
  if (!state.user) { toast('Войдите, чтобы оформить заказ', true); return go('#/login'); }
  if (state.user.role !== 'buyer') return go('#/seller');
  if (!state.cart.length) return go('#/cart');

  app.innerHTML = `
    <div class="card form-card">
      <h2>Оформление заказа</h2>
      <p class="muted">Товаров: ${cartCount()} · К оплате: <b>${money(cartTotal())}</b></p>
      <form id="form">
        <label>Адрес доставки</label>
        <input name="address" required placeholder="г. Тараз, ул. ...">
        <label>Телефон</label>
        <input name="phone" required placeholder="+7 ...">
        <p class="error-text" id="err"></p>
        <button class="btn" style="width:100%">Подтвердить заказ</button>
      </form>
    </div>`;

  document.getElementById('form').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      await api('/orders', {
        method: 'POST',
        body: {
          items: state.cart.map((i) => ({ product_id: i.id, quantity: i.quantity })),
          address: f.get('address'),
          phone: f.get('phone'),
        },
      });
      state.cart = [];
      saveCart(); renderNav();
      toast('Заказ оформлен!');
      go('#/orders');
    } catch (err) {
      document.getElementById('err').textContent = err.message;
    }
  };
}

function orderCard(o, { seller = false } = {}) {
  const idx = STEPS.indexOf(o.status);
  const tracker = o.status === 'cancelled' ? '' : `
    <div class="steps">${STEPS.map((s, i) => `<span class="${i <= idx ? 'done' : ''}">${STATUS_LABELS[s]}</span>`).join('')}</div>`;

  const controls = seller ? `
    <div class="row">
      <select data-status="${o.id}" style="width:180px">
        ${Object.entries(STATUS_LABELS).map(([k, v]) => `<option value="${k}" ${k === o.status ? 'selected' : ''}>${v}</option>`).join('')}
      </select>
    </div>` : '';

  return `
    <div class="card order">
      <div class="order-head">
        <b>Заказ №${o.id}</b>
        <span class="status ${o.status}">${STATUS_LABELS[o.status]}</span>
      </div>
      <div class="muted">${dateStr(o.created_at)}${seller ? ` · Покупатель: ${esc(o.buyer_name)}` : ''}</div>
      ${tracker}
      <ul>${o.items.map((i) => `<li>${esc(i.title)} × ${i.quantity} — ${money(i.price * i.quantity)}</li>`).join('')}</ul>
      <div class="muted">Адрес: ${esc(o.address)} · Тел.: ${esc(o.phone)}</div>
      <div class="row space" style="margin-top:8px"><b>Итого: ${money(o.total)}</b>${controls}</div>
    </div>`;
}

async function pageOrders() {
  if (!state.user) return go('#/login');
  if (state.user.role !== 'buyer') return go('#/seller');
  const orders = await api('/orders');
  app.innerHTML = '<h1>Мои заказы</h1>' + (orders.length
    ? orders.map((o) => orderCard(o)).join('')
    : '<div class="empty">Заказов пока нет</div>');
}

function pageLogin() {
  app.innerHTML = `
    <div class="card form-card">
      <h2>Вход</h2>
      <form id="form">
        <label>Email</label><input name="email" type="email" required>
        <label>Пароль</label><input name="password" type="password" required>
        <p class="error-text" id="err"></p>
        <button class="btn" style="width:100%">Войти</button>
      </form>
      <p class="muted">Нет аккаунта? <a href="#/register">Регистрация</a></p>
    </div>`;
  document.getElementById('form').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      const { token, user } = await api('/auth/login', { method: 'POST', body: { email: f.get('email'), password: f.get('password') } });
      afterAuth(token, user);
    } catch (err) { document.getElementById('err').textContent = err.message; }
  };
}

function pageRegister() {
  app.innerHTML = `
    <div class="card form-card">
      <h2>Регистрация</h2>
      <form id="form">
        <label>Имя</label><input name="name" required>
        <label>Email</label><input name="email" type="email" required>
        <label>Пароль (мин. 6 символов)</label><input name="password" type="password" minlength="6" required>
        <label>Я</label>
        <select name="role"><option value="buyer">Покупатель</option><option value="seller">Продавец</option></select>
        <p class="error-text" id="err"></p>
        <button class="btn" style="width:100%">Создать аккаунт</button>
      </form>
      <p class="muted">Уже есть аккаунт? <a href="#/login">Войти</a></p>
    </div>`;
  document.getElementById('form').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      const { token, user } = await api('/auth/register', {
        method: 'POST',
        body: { name: f.get('name'), email: f.get('email'), password: f.get('password'), role: f.get('role') },
      });
      afterAuth(token, user);
    } catch (err) { document.getElementById('err').textContent = err.message; }
  };
}

function afterAuth(token, user) {
  saveSession(token, user);
  if (user.role === 'seller') state.cart = [];
  renderNav();
  go(user.role === 'seller' ? '#/seller' : '#/');
}

// ---------- админ-панель продавца ----------

let sellerTab = 'products';

async function pageSeller() {
  if (!state.user) return go('#/login');
  if (state.user.role !== 'seller') return go('#/');

  app.innerHTML = `
    <h1>Панель продавца</h1>
    <div class="tabs">
      <button data-tab="products" class="${sellerTab === 'products' ? 'active' : ''}">Товары</button>
      <button data-tab="orders" class="${sellerTab === 'orders' ? 'active' : ''}">Заказы</button>
    </div>
    <div id="tab"></div>`;
  app.querySelectorAll('[data-tab]').forEach((b) => {
    b.onclick = () => { sellerTab = b.dataset.tab; pageSeller(); };
  });
  if (sellerTab === 'products') await sellerProducts(); else await sellerOrders();
}

async function sellerProducts() {
  const products = await api('/seller/products');
  const tab = document.getElementById('tab');
  tab.innerHTML = `
    <div style="margin-bottom:12px"><a class="btn" href="#/seller/product/new">+ Добавить товар</a></div>
    ${products.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Название</th><th>Категория</th><th>Цена</th><th>Остаток</th><th></th></tr></thead>
      <tbody>${products.map((p) => `
        <tr>
          <td>${esc(p.title)}</td><td>${esc(p.category)}</td><td>${money(p.price)}</td><td>${p.stock}</td>
          <td class="row">
            <a class="btn small secondary" href="#/seller/product/${p.id}">Изменить</a>
            <button class="btn small danger" data-del="${p.id}">Удалить</button>
          </td>
        </tr>`).join('')}</tbody></table></div>` : '<div class="empty">У вас пока нет товаров</div>'}`;
  tab.querySelectorAll('[data-del]').forEach((b) => {
    b.onclick = async () => {
      if (!confirm('Удалить товар?')) return;
      try {
        const r = await api('/products/' + b.dataset.del, { method: 'DELETE' });
        toast(r.hidden ? 'Товар есть в заказах — скрыт из каталога' : 'Товар удалён');
        sellerProducts();
      } catch (err) { toast(err.message, true); }
    };
  });
}

async function sellerOrders() {
  const orders = await api('/seller/orders');
  const tab = document.getElementById('tab');
  tab.innerHTML = orders.length ? orders.map((o) => orderCard(o, { seller: true })).join('') : '<div class="empty">Заказов пока нет</div>';
  tab.querySelectorAll('[data-status]').forEach((sel) => {
    sel.onchange = async () => {
      try {
        await api(`/orders/${sel.dataset.status}/status`, { method: 'PATCH', body: { status: sel.value } });
        toast('Статус обновлён');
        sellerOrders();
      } catch (err) { toast(err.message, true); }
    };
  });
}

async function pageProductForm(id) {
  if (!state.user || state.user.role !== 'seller') return go('#/login');
  let p = { title: '', description: '', price: '', stock: '', category: '', image_url: '' };
  if (id !== 'new') p = await api('/products/' + id);

  app.innerHTML = `
    <div class="card form-card" style="max-width:560px">
      <h2>${id === 'new' ? 'Новый товар' : 'Редактирование товара'}</h2>
      <form id="form">
        <label>Название</label><input name="title" required value="${esc(p.title)}">
        <label>Описание</label><textarea name="description" rows="3">${esc(p.description)}</textarea>
        <div class="row">
          <div style="flex:1"><label>Цена, ₸</label><input name="price" type="number" min="0" step="1" required value="${esc(p.price)}"></div>
          <div style="flex:1"><label>Остаток, шт.</label><input name="stock" type="number" min="0" step="1" required value="${esc(p.stock)}"></div>
        </div>
        <label>Категория</label><input name="category" value="${esc(p.category)}" placeholder="Электроника">
        <label>Ссылка на картинку</label><input name="image_url" value="${esc(p.image_url)}" placeholder="https://...">
        <p class="error-text" id="err"></p>
        <div class="row"><button class="btn">Сохранить</button><a class="btn secondary" href="#/seller">Отмена</a></div>
      </form>
    </div>`;

  document.getElementById('form').onsubmit = async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target));
    try {
      if (id === 'new') await api('/products', { method: 'POST', body });
      else await api('/products/' + id, { method: 'PUT', body });
      toast('Сохранено');
      sellerTab = 'products';
      go('#/seller');
    } catch (err) { document.getElementById('err').textContent = err.message; }
  };
}

// ---------- роутер ----------

async function route() {
  const hash = location.hash || '#/';
  const parts = hash.slice(2).split('/'); // '#/product/5' -> ['product','5']
  window.scrollTo(0, 0);
  try {
    switch (parts[0]) {
      case '': await pageCatalog(); break;
      case 'product': await pageProduct(parts[1]); break;
      case 'cart': pageCart(); break;
      case 'checkout': pageCheckout(); break;
      case 'orders': await pageOrders(); break;
      case 'login': pageLogin(); break;
      case 'register': pageRegister(); break;
      case 'seller':
        if (parts[1] === 'product') await pageProductForm(parts[2]);
        else await pageSeller();
        break;
      default: app.innerHTML = '<div class="empty"><h2>Страница не найдена</h2><a href="#/">На главную</a></div>';
    }
  } catch (err) {
    app.innerHTML = `<div class="empty"><h2>Ошибка</h2><p>${esc(err.message)}</p><a href="#/">На главную</a></div>`;
  }
}

window.addEventListener('hashchange', route);
renderNav();
route();

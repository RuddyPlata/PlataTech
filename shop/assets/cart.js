/* ════════════════════════════════════════════════════════
   Shopping Cart - localStorage based
   ════════════════════════════════════════════════════════ */

const CART_KEY = 'platatech_cart_v1';

window.Cart = {
  get() {
    try {
      return JSON.parse(localStorage.getItem(CART_KEY) || '[]');
    } catch (e) { return []; }
  },

  save(items) {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
    this.updateBadge();
    window.dispatchEvent(new CustomEvent('cart:change'));
  },

  add(slug, qty = 1) {
    const items = this.get();
    const existing = items.find(i => i.slug === slug);
    if (existing) {
      existing.qty += qty;
    } else {
      items.push({ slug, qty });
    }
    this.save(items);
    return items;
  },

  remove(slug) {
    const items = this.get().filter(i => i.slug !== slug);
    this.save(items);
    return items;
  },

  setQty(slug, qty) {
    if (qty < 1) return this.remove(slug);
    const items = this.get();
    const item = items.find(i => i.slug === slug);
    if (item) { item.qty = qty; this.save(items); }
    return items;
  },

  clear() {
    localStorage.removeItem(CART_KEY);
    this.updateBadge();
    window.dispatchEvent(new CustomEvent('cart:change'));
  },

  count() {
    return this.get().reduce((sum, i) => sum + i.qty, 0);
  },

  totals() {
    const items = this.get();
    let subtotal = 0;
    items.forEach(i => {
      const p = window.getProductBySlug(i.slug);
      if (p) subtotal += p.price * i.qty;
    });
    const itbis = Math.round(subtotal * 0.18);
    const total = subtotal + itbis;
    return { subtotal, itbis, total, itemCount: this.count() };
  },

  /* Update all cart badges on the page */
  updateBadge() {
    const count = this.count();
    document.querySelectorAll('[data-cart-count]').forEach(el => {
      el.textContent = count;
      el.classList.toggle('has-items', count > 0);
    });
  },

  /* Show a floating toast when item added */
  toast(msg) {
    let t = document.getElementById('cartToast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'cartToast';
      t.className = 'cart-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._hide);
    t._hide = setTimeout(() => t.classList.remove('show'), 2200);
  }
};

/* Initialize badges on page load */
document.addEventListener('DOMContentLoaded', () => window.Cart.updateBadge());

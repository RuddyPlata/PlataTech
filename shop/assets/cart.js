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

  /* Show a floating toast anchored to cart button, with checkout CTA */
  toast(msg) {
    let t = document.getElementById('cartToast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'cartToast';
      t.className = 'cart-toast';
      t.innerHTML = ''
        + '<div class="cart-toast-icon">'
        +   '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>'
        + '</div>'
        + '<div class="cart-toast-body">'
        +   '<div class="cart-toast-msg" id="cartToastMsg"></div>'
        +   '<div class="cart-toast-actions">'
        +     '<a href="cart.html" class="cart-toast-btn primary">Ir a checkout'
        +       '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>'
        +     '</a>'
        +     '<button type="button" class="cart-toast-btn ghost" id="cartToastClose">Seguir comprando</button>'
        +   '</div>'
        + '</div>';
      document.body.appendChild(t);
      t.querySelector('#cartToastClose').addEventListener('click', () => {
        t.classList.remove('show');
        clearTimeout(t._hide);
      });
    }
    t.querySelector('#cartToastMsg').textContent = msg;
    /* Anchor horizontally to cart-btn so the arrow lines up */
    const cartBtn = document.querySelector('.cart-btn');
    if (cartBtn) {
      const r = cartBtn.getBoundingClientRect();
      const rightOffset = Math.max(12, window.innerWidth - r.right + (r.width / 2) - 28);
      t.style.right = rightOffset + 'px';
      t.style.top = (r.bottom + 12) + 'px';
    }
    t.classList.add('show');
    clearTimeout(t._hide);
    t._hide = setTimeout(() => t.classList.remove('show'), 4500);
  }
};

/* Initialize badges on page load */
document.addEventListener('DOMContentLoaded', () => window.Cart.updateBadge());

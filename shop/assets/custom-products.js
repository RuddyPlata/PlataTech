/* custom-products.js
   Loads published custom products from Supabase and adds them to
   window.PRODUCTS. Custom products with a unique slug are appended.
   A custom product only replaces a YDC product if it has the exact
   same slug AND was intentionally created as an override (override_ydc=true).
   Also adjusts stock based on orders placed since the last inventory sync.
   Must be included AFTER sb.js and products.js. */
(async function loadCustomProducts() {
  if (!window.SB || !Array.isArray(window.PRODUCTS)) return;
  try {
    /* ── 1. Load custom products ───────────────────────── */
    const { data, error } = await window.SB
      .from('custom_products')
      .select('*')
      .eq('published', true)
      .order('created_at', { ascending: false });

    if (!error && data && data.length) {
      const mapped = data.map(r => ({
        slug:        r.slug,
        name:        r.name,
        brand:       r.brand || '',
        category:    r.category || 'varios',
        price:       r.price,
        oldPrice:    r.old_price || null,
        variant:     r.variant || '',
        stock:       r.stock ?? 10,
        badge:       r.badge || null,
        badgeText:   r.badge_text || '',
        description: r.description || '',
        imageUrl:    r.image_url || null,
        overrideYdc: r.override_ydc || false,
        _custom:     true
      }));

      const existingSlugs = new Set(window.PRODUCTS.map(p => p.slug));

      mapped.forEach(cp => {
        if (existingSlugs.has(cp.slug)) {
          if (cp.overrideYdc) {
            const idx = window.PRODUCTS.findIndex(p => p.slug === cp.slug);
            if (idx !== -1) window.PRODUCTS[idx] = { ...window.PRODUCTS[idx], ...cp };
          }
        } else {
          window.PRODUCTS.push(cp);
          existingSlugs.add(cp.slug);
        }
      });
    }

    /* ── 2. Adjust stock for orders since last sync ────── */
    const since = window.PRODUCTS_LAST_SYNC;
    if (since) {
      const { data: soldData } = await window.SB.rpc('get_stock_sold_since', {
        since_ts: new Date(since).toISOString()
      });
      if (soldData && soldData.length) {
        const sold = {};
        soldData.forEach(row => { sold[row.slug] = Number(row.sold_qty) || 0; });
        window.PRODUCTS.forEach(p => {
          if (sold[p.slug]) p.stock = Math.max(0, p.stock - sold[p.slug]);
        });
      }
    }

    /* ── 3. Rebuild slug lookup & notify ──────────────── */
    if (typeof window._productSlugMap !== 'undefined') {
      window._productSlugMap = new Map(window.PRODUCTS.map(p => [p.slug, p]));
    }

    window.dispatchEvent(new CustomEvent('products:updated'));
  } catch (e) {
    console.warn('custom-products load error', e);
  }
})();

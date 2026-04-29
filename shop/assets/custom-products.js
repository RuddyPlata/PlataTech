/* custom-products.js
   Loads published custom products from Supabase and adds them to
   window.PRODUCTS. Custom products with a unique slug are appended.
   A custom product only replaces a YDC product if it has the exact
   same slug AND was intentionally created as an override (override_ydc=true).
   Must be included AFTER sb.js and products.js. */
(async function loadCustomProducts() {
  if (!window.SB || !Array.isArray(window.PRODUCTS)) return;
  try {
    const { data, error } = await window.SB
      .from('custom_products')
      .select('*')
      .eq('published', true)
      .order('created_at', { ascending: false });

    if (error || !data || !data.length) return;

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
        // Only replace if explicitly marked as override
        if (cp.overrideYdc) {
          const idx = window.PRODUCTS.findIndex(p => p.slug === cp.slug);
          if (idx !== -1) window.PRODUCTS[idx] = { ...window.PRODUCTS[idx], ...cp };
        }
        // Otherwise skip silently — YDC product stays untouched
      } else {
        // New product not in YDC catalog — append
        window.PRODUCTS.push(cp);
        existingSlugs.add(cp.slug);
      }
    });

    // Rebuild slug lookup if it exists
    if (typeof window._productSlugMap !== 'undefined') {
      window._productSlugMap = new Map(window.PRODUCTS.map(p => [p.slug, p]));
    }

    window.dispatchEvent(new CustomEvent('products:updated'));
  } catch (e) {
    console.warn('custom-products load error', e);
  }
})();

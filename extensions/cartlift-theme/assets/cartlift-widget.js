(() => {
  const ROOT_ID = 'cartlift-widget-root';
  const root = document.getElementById(ROOT_ID);
  if (!root) return;

  const money = (cents) => {
    try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: (window.Shopify?.currency?.active || 'USD') }).format(cents / 100); }
    catch { return `$${(cents / 100).toFixed(2)}`; }
  };

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  async function getCart() {
    const r = await fetch('/cart.js', { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!r.ok) throw new Error('cart');
    return r.json();
  }

  async function recommendations(productId) {
    if (!productId) return null;
    const url = `/recommendations/products.json?product_id=${encodeURIComponent(productId)}&limit=1&intent=complementary`;
    const r = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!r.ok) return null;
    const data = await r.json();
    return data.products?.[0] || null;
  }

  async function add(product) {
    const variantId = product.variants?.find(v => v.available)?.id || product.variants?.[0]?.id;
    if (!variantId) return;
    await fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ items: [{ id: variantId, quantity: 1 }] })
    });
    await render();
    document.dispatchEvent(new CustomEvent('cart:refresh'));
  }

  let drawerWasOpen = false;
  let drawerCheckTimer;

  function getCartDrawer() {
    const selectors = [
      'cart-drawer',
      '#CartDrawer',
      '.cart-drawer',
      '[data-cart-drawer]'
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (!element) continue;
      const styles = window.getComputedStyle(element);
      const open = element.hasAttribute('open') ||
        element.getAttribute('aria-hidden') === 'false' ||
        element.classList.contains('active') ||
        element.classList.contains('open') ||
        element.classList.contains('animate');
      if (open && styles.display !== 'none' && styles.visibility !== 'hidden') return element;
    }
    return null;
  }

  async function dispatchCartDrawerView() {
    if (window.location.pathname === '/cart') return;

    const drawer = getCartDrawer();
    if (!drawer) return;
    if (drawerWasOpen) return;
    drawerWasOpen = true;

    try {
      const cart = await getCart();
      const { CartViewEvent } = window.StandardEvents || {};

      if (CartViewEvent) {
        drawer.dispatchEvent(new CartViewEvent({
          context: 'dialog',
          cart: CartViewEvent.createCartFromAjaxResponse(cart),
        }));
        return;
      }

      // Fallback for themes that don't expose Shopify's StandardEvents helper.
      const publish = window.Shopify?.analytics?.publish;
      if (typeof publish === 'function') {
        Promise.resolve(publish('cartlift:cart_drawer_viewed', {
          context: 'dialog',
          item_count: cart.item_count,
          total_price: cart.total_price,
          currency: cart.currency,
        })).catch(() => undefined);
      }
    } catch {
      // Cart-view analytics must never interfere with the storefront.
    }
  }

  function checkCartDrawer() {
    clearTimeout(drawerCheckTimer);
    drawerCheckTimer = setTimeout(async () => {
      const open = Boolean(getCartDrawer());
      if (open) await dispatchCartDrawerView();
      else drawerWasOpen = false;
    }, 80);
  }

  async function render() {
    try {
      const cart = await getCart();
      if (!cart.item_count) { root.innerHTML = ''; root.hidden = true; return; }

      const last = cart.items[cart.items.length - 1];
      const rec = await recommendations(last?.product_id);
      const inCart = new Set(cart.items.map(i => i.product_id));
      const product = rec && !inCart.has(rec.id) ? rec : null;
      const goal = Number(root.dataset.goal || 100000);
      const remaining = Math.max(0, goal - cart.total_price);
      const percent = Math.min(100, Math.round((cart.total_price / goal) * 100));

      root.hidden = false;
      root.innerHTML = `<section class="cartlift-card" aria-label="CartLift">
        <div class="cartlift-head"><strong>CartLift</strong><button type="button" data-dismiss aria-label="Dismiss">×</button></div>
        <div class="cartlift-progress-title">${remaining ? `You're ${money(remaining)} away from free shipping` : '🎉 You unlocked free shipping'}</div>
        <div class="cartlift-track"><span style="width:${percent}%"></span></div>
        ${product ? `<div class="cartlift-rec">
          <img src="${escapeHtml(product.featured_image || '')}" alt="${escapeHtml(product.title)}" loading="lazy">
          <div class="cartlift-copy"><small>Recommended for your cart</small><strong>${escapeHtml(product.title)}</strong><span>${money(product.price * 100)}</span></div>
          <button type="button" data-add>Add</button>
        </div>` : ''}
      </section>`;
      root.querySelector('[data-dismiss]')?.addEventListener('click', () => { root.hidden = true; });
      root.querySelector('[data-add]')?.addEventListener('click', async (e) => { e.currentTarget.disabled = true; await add(product); });
    } catch {
      root.hidden = true;
    }
  }

  render();
  document.addEventListener('cart:refresh', render);
  document.addEventListener('shopify:section:load', render);
  document.addEventListener('shopify:cart:lines-update', render);

  // Shopify's standard storefront cart:view event is the preferred signal.
  // Some older themes do not dispatch it, so observe the drawer state as a
  // compatibility fallback and emit a real StandardEvents CartViewEvent.
  document.addEventListener('shopify:cart:view', () => {
    drawerWasOpen = true;
    render();
  });

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest?.(
      'a[href*="/cart"], button[aria-controls*="CartDrawer"], [data-cart-toggle], [data-cart-drawer-toggle], .cart-icon-bubble'
    );
    if (trigger) checkCartDrawer();
  }, true);

  const observer = new MutationObserver(checkCartDrawer);
  observer.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['open', 'class', 'aria-hidden'] });
  window.addEventListener('pageshow', checkCartDrawer);
})();

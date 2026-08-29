(() => {
  const ROOT_ID = 'cartlift-widget-root';
  const root = document.getElementById(ROOT_ID);
  if (!root) return;

  const money = (cents) => {
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: window.Shopify?.currency?.active || 'USD',
        maximumFractionDigits: 2,
      }).format(cents / 100);
    } catch {
      return `$${(cents / 100).toFixed(2)}`;
    }
  };

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>\"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;'
  }[c]));

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
    const variantId = product?.variants?.find(v => v.available)?.id || product?.variants?.[0]?.id;
    if (!variantId) return;
    const r = await fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ items: [{ id: variantId, quantity: 1 }] })
    });
    if (!r.ok) throw new Error('add');
    document.dispatchEvent(new CustomEvent('cart:refresh'));
  }

  let drawerWasOpen = false;
  let drawerCheckTimer;

  function getCartDrawer() {
    const selectors = [
      'cart-drawer',
      'cart-drawer-component',
      '#CartDrawer',
      '.cart-drawer',
      '[data-cart-drawer]',
      '[role="dialog"][aria-modal="true"]'
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (!element) continue;
      const styles = window.getComputedStyle(element);
      const open = element.hasAttribute('open') ||
        element.getAttribute('aria-hidden') === 'false' ||
        element.getAttribute('aria-modal') === 'true' ||
        element.classList.contains('active') ||
        element.classList.contains('open') ||
        element.classList.contains('animate');
      if (open && styles.display !== 'none' && styles.visibility !== 'hidden') return element;
    }
    return null;
  }

  function getCartSurface() {
    const drawer = getCartDrawer();
    if (drawer) {
      return drawer.querySelector(
        '.drawer__inner, .drawer__contents, .cart-drawer__content, .cart-drawer__contents, .cart-drawer__dialog, .cart-drawer__inner'
      ) || drawer;
    }

    if (window.location.pathname === '/cart') {
      return document.querySelector(
        'main-cart, cart-items, .main-cart-items, .cart__items, form[action="/cart"]'
      );
    }

    return null;
  }

  function mountRoot() {
    const surface = getCartSurface();
    if (surface && surface !== root && !surface.contains(root)) {
      const checkout = surface.querySelector(
        '.cart__ctas, .cart-drawer__footer, .drawer__footer, [data-cart-checkout], button[name="checkout"], a[href*="/checkout"]'
      );
      if (checkout?.parentNode) checkout.parentNode.insertBefore(root, checkout);
      else surface.appendChild(root);
      root.classList.add('cartlift-inline');
      return true;
    }

    if (!surface && root.parentElement !== document.body) {
      document.body.appendChild(root);
      root.classList.remove('cartlift-inline');
    }
    return Boolean(surface);
  }

  async function dispatchCartDrawerView() {
    if (window.location.pathname === '/cart' || drawerWasOpen) return;

    const cart = await getCart().catch(() => null);
    if (!cart) return;
    drawerWasOpen = true;

    try {
      const publish = window.Shopify?.analytics?.publish;
      if (typeof publish === 'function') {
        await Promise.resolve(publish('cartlift:cart_drawer_viewed', {
          context: 'dialog',
          item_count: cart.item_count,
          total_price: cart.total_price,
          currency: cart.currency,
        }));
      }
    } catch {
      // Cart-view analytics must never interfere with the storefront.
    }
  }

  function checkCartDrawer() {
    clearTimeout(drawerCheckTimer);
    drawerCheckTimer = setTimeout(async () => {
      const open = Boolean(getCartDrawer());
      if (open) {
        await dispatchCartDrawerView();
        await render();
      } else {
        drawerWasOpen = false;
      }
    }, 120);
  }

  function checkCartDrawerSoon() {
    [80, 180, 350, 650].forEach((delay) => window.setTimeout(checkCartDrawer, delay));
  }

  async function render() {
    try {
      const cart = await getCart();
      if (!cart.item_count) {
        root.innerHTML = '';
        root.hidden = true;
        return;
      }

      const isMountedInline = mountRoot();
      const last = cart.items[cart.items.length - 1];
      const rec = await recommendations(last?.product_id).catch(() => null);
      const inCart = new Set(cart.items.map(i => i.product_id));
      const product = rec && !inCart.has(rec.id) ? rec : null;
      const goal = Number(root.dataset.goal || 100000);
      const remaining = Math.max(0, goal - cart.total_price);
      const percent = Math.min(100, goal > 0 ? Math.round((cart.total_price / goal) * 100) : 0);
      const unlocked = goal > 0 && remaining === 0;

      root.hidden = false;
      root.innerHTML = `<section class="cartlift-card" aria-label="CartLift free shipping progress">
        <div class="cartlift-topline">
          <span class="cartlift-badge"><span class="cartlift-dot"></span> CartLift</span>
          <button type="button" data-dismiss aria-label="Dismiss CartLift">×</button>
        </div>
        <div class="cartlift-message">
          <div class="cartlift-kicker">${unlocked ? 'GOAL REACHED' : 'FREE SHIPPING GOAL'}</div>
          <strong>${goal <= 0 ? 'Free shipping goal is off' : unlocked ? 'Free shipping unlocked' : `${money(remaining)} more to unlock free shipping`}</strong>
          ${goal > 0 ? `<span>${unlocked ? 'Nice — you’re all set.' : `You’re ${percent}% of the way there.`}</span>` : ''}
        </div>
        ${goal > 0 ? `<div class="cartlift-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}">
          <span style="width:${percent}%"></span>
        </div>` : ''}
        ${product ? `<div class="cartlift-rec">
          <img src="${escapeHtml(product.featured_image || '')}" alt="${escapeHtml(product.title)}" loading="lazy">
          <div class="cartlift-copy">
            <small>Good match for your cart</small>
            <strong>${escapeHtml(product.title)}</strong>
            <span>${money(product.price * 100)}</span>
          </div>
          <button type="button" data-add>Add</button>
        </div>` : ''}
      </section>`;

      root.querySelector('[data-dismiss]')?.addEventListener('click', () => {
        root.hidden = true;
      });
      root.querySelector('[data-add]')?.addEventListener('click', async (e) => {
        const button = e.currentTarget;
        button.disabled = true;
        button.textContent = 'Adding…';
        try {
          await add(product);
        } catch {
          button.disabled = false;
          button.textContent = 'Add';
        }
      });

      if (isMountedInline) root.classList.add('cartlift-inline');
    } catch {
      root.hidden = true;
    }
  }

  void render();
  document.addEventListener('cart:refresh', render);
  document.addEventListener('shopify:section:load', render);
  document.addEventListener('shopify:cart:lines-update', render);

  document.addEventListener('shopify:cart:view', () => {
    drawerWasOpen = true;
    void render();
  });

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest?.(
      'a[href*="/cart"], button[aria-controls*="CartDrawer"], [data-cart-toggle], [data-cart-drawer-toggle], .cart-icon-bubble, [aria-label*="cart" i]'
    );
    if (trigger) checkCartDrawerSoon();
  }, true);

  const observer = new MutationObserver(checkCartDrawer);
  observer.observe(document.documentElement, {
    subtree: true,
    attributes: true,
    attributeFilter: ['open', 'class', 'aria-hidden']
  });
  window.addEventListener('pageshow', checkCartDrawerSoon);
})();

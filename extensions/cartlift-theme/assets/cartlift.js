(() => {
  const root = document.getElementById("cartlift-root");
  if (!root || root.dataset.loaded === "1") return;
  root.dataset.loaded = "1";

  const routes = window.Shopify?.routes || { root: "/" };
  const rootPath = routes.root || "/";
  const cartUrl = `${rootPath}cart.js`;
  const addUrl = `${rootPath}cart/add.js`;
  const analyticsUrl = "https://windingpurplevalue.pages.dev/api/analytics";
  const shop = String(window.Shopify?.shop || document.documentElement.dataset.shop || location.hostname || "");
  const money = (amount, currency) => new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
  const thresholdFor = (currency) => ({ INR: 1000, USD: 50, EUR: 50, GBP: 50, AUD: 75, CAD: 75, SGD: 75 })[currency] || 50;

  const message = root.querySelector(".cartlift-message");
  const progress = root.querySelector(".cartlift-progress");
  const recommendation = root.querySelector(".cartlift-recommendation");
  const recTitle = root.querySelector(".cartlift-rec-title");
  const recPrice = root.querySelector(".cartlift-rec-price");
  const addButton = root.querySelector(".cartlift-add");
  const closeButton = root.querySelector(".cartlift-close");

  let currentRecommendation = null;
  let loading = false;
  let reloadTimer = null;
  let reloadRequested = false;
  let lastCartSignature = "";
  const sentEvents = new Set();

  function track(event, data = null) {
    if (!shop) return;
    const dedupeKey = `${event}:${data?.cart_token || data?.product_id || ""}`;
    if (sentEvents.has(dedupeKey)) return;
    sentEvents.add(dedupeKey);
    fetch(analyticsUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, shop, timestamp: Date.now(), payload: { id: null, data } }),
      keepalive: true,
    }).catch(() => {});
  }

  closeButton?.addEventListener("click", () => { root.hidden = true; });

  async function getCart() {
    const response = await fetch(cartUrl, { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) throw new Error("cart request failed");
    return response.json();
  }

  async function getRecommendation(cart) {
    const first = cart.items?.[0];
    if (!first?.product_id) return null;
    const url = `${rootPath}recommendations/products.json?product_id=${encodeURIComponent(first.product_id)}&limit=1&intent=related`;
    const response = await fetch(url, { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) return null;
    const data = await response.json();
    const inCart = new Set((cart.items || []).map((item) => item.product_id));
    return (data.products || []).find((product) => !inCart.has(product.id) && product.available !== false) || null;
  }

  function renderCart(cart) {
    const subtotal = Number(cart.items_subtotal_price ?? cart.total_price ?? 0) / 100;
    const currency = cart.currency || "USD";
    const threshold = thresholdFor(currency);
    const remaining = Math.max(0, threshold - subtotal);
    const percent = Math.min(100, Math.round((subtotal / threshold) * 100));
    progress.style.width = `${percent}%`;
    message.textContent = remaining > 0 ? `Add ${money(remaining, currency)} more for free shipping` : "🎉 You unlocked free shipping";
    root.hidden = !cart.item_count;
  }

  async function load() {
    if (loading) { reloadRequested = true; return; }
    loading = true;
    reloadRequested = false;
    try {
      const cart = await getCart();
      const signature = JSON.stringify({ token: cart.token || "", count: cart.item_count || 0, total: cart.total_price || 0, items: (cart.items || []).map((i) => [i.key, i.quantity]) });
      lastCartSignature = signature;
      if (!cart.item_count) {
        root.hidden = true;
        currentRecommendation = null;
        recommendation.hidden = true;
        return;
      }
      root.hidden = false;
      renderCart(cart);
      track("cart_viewed", { cart_token: cart.token || null, item_count: cart.item_count, total_price: cart.total_price || 0, currency: cart.currency || "USD" });
      currentRecommendation = await getRecommendation(cart);
      if (currentRecommendation?.variants?.[0]?.id) {
        recTitle.textContent = currentRecommendation.title || "Recommended for you";
        recPrice.textContent = currentRecommendation.price ? money(Number(currentRecommendation.price), cart.currency || "USD") : "";
        recommendation.hidden = false;
        addButton.disabled = false;
      } else {
        recommendation.hidden = true;
      }
    } catch (_) {
      root.hidden = true;
    } finally {
      loading = false;
      if (reloadRequested) scheduleLoad(40);
    }
  }

  function scheduleLoad(delay = 120) {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(load, delay);
  }

  function scheduleAfterCartChange() {
    scheduleLoad(80);
    setTimeout(() => scheduleLoad(80), 500);
    setTimeout(() => scheduleLoad(80), 1200);
  }

  addButton?.addEventListener("click", async () => {
    const variantId = currentRecommendation?.variants?.[0]?.id;
    if (!variantId) return;
    addButton.disabled = true;
    addButton.textContent = "Adding…";
    try {
      const response = await fetch(addUrl, {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ items: [{ id: variantId, quantity: 1 }] }),
      });
      if (!response.ok) throw new Error("add failed");
      track("product_added_to_cart", { product_id: currentRecommendation.id || null, variant_id: variantId, quantity: 1, source: "cartlift_recommendation" });
      window.dispatchEvent(new CustomEvent("cartlift:cart-updated"));
      document.dispatchEvent(new CustomEvent("cart:refresh", { bubbles: true }));
      await load();
      scheduleAfterCartChange();
      addButton.textContent = "Added";
      setTimeout(() => { addButton.textContent = "Add"; }, 1200);
    } catch (_) {
      addButton.disabled = false;
      addButton.textContent = "Retry";
    }
  });

  ["cart:updated", "cart:refresh", "cart:change"].forEach((eventName) => document.addEventListener(eventName, scheduleAfterCartChange));
  window.addEventListener("cart:change", scheduleAfterCartChange);
  window.addEventListener("pageshow", () => scheduleLoad(50));

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('form[action*="/cart"], [name="add"], [name="quantity"], button[aria-label*="cart" i], a[href*="/cart"]')) scheduleAfterCartChange();
  }, true);

  document.addEventListener("submit", (event) => {
    const form = event.target instanceof HTMLFormElement ? event.target : null;
    if (form?.action && /\/cart\/(add|change|update|clear)/.test(form.action)) scheduleAfterCartChange();
  }, true);

  const originalFetch = window.fetch;
  window.fetch = function (input, init) {
    const requestUrl = typeof input === "string" ? input : input?.url || "";
    const result = originalFetch.apply(this, arguments);
    if (/\/cart\/(add|change|update|clear)(\.js)?(?:[?#]|$)/.test(requestUrl)) {
      result.then(() => {
        if (/\/cart\/add(\.js)?(?:[?#]|$)/.test(requestUrl)) track("product_added_to_cart", { source: "storefront_cart" });
        scheduleAfterCartChange();
      }).catch(() => {});
    }
    return result;
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__cartliftCartRequest = typeof url === "string" && /\/cart\/(add|change|update|clear)(\.js)?(?:[?#]|$)/.test(url);
    return originalOpen.apply(this, arguments);
  };
  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function () {
    if (this.__cartliftCartRequest) {
      this.addEventListener("load", () => scheduleAfterCartChange(), { once: true });
    }
    return originalSend.apply(this, arguments);
  };

  // Shopify themes can update the cart drawer without emitting a shared event.
  // Watch the cart UI as a final lightweight signal, then fetch the authoritative cart.js state.
  const observer = new MutationObserver(() => {
    if (!loading) scheduleLoad(180);
  });
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-cart-count", "data-cart-item-count", "aria-label"] });

  // A short-lived consistency check catches themes that update cart state through custom APIs.
  let checks = 0;
  const consistencyTimer = setInterval(async () => {
    if (document.hidden || loading) return;
    checks += 1;
    try {
      const cart = await getCart();
      const signature = JSON.stringify({ token: cart.token || "", count: cart.item_count || 0, total: cart.total_price || 0, items: (cart.items || []).map((i) => [i.key, i.quantity]) });
      if (signature !== lastCartSignature) await load();
    } catch (_) {}
    if (checks >= 20) clearInterval(consistencyTimer);
  }, 1500);

  track("page_viewed", { path: window.location.pathname, title: document.title });
  const productId = document.querySelector('meta[property="product:id"]')?.content || document.querySelector("[data-product-id]")?.getAttribute("data-product-id") || null;
  if (productId) track("product_viewed", { product_id: productId });
  load();
})();

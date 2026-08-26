(() => {
  const root = document.getElementById("cartlift-root");
  if (!root || root.dataset.loaded === "1") return;
  root.dataset.loaded = "1";

  const routes = window.Shopify?.routes || { root: "/" };
  const rootPath = routes.root || "/";
  const cartUrl = `${rootPath}cart.js`;
  const addUrl = `${rootPath}cart/add.js`;
  const money = (amount, currency) => new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
  const thresholdFor = (currency) => ({ INR: 1000, USD: 50, EUR: 50, GBP: 50, AUD: 75, CAD: 75, SGD: 75 })[currency] || 50;

  root.hidden = true;
  root.innerHTML = `
    <div class="cartlift-card" role="status" aria-live="polite">
      <div class="cartlift-heading"><span>CartLift</span><button class="cartlift-close" type="button" aria-label="Close">×</button></div>
      <div class="cartlift-message"></div>
      <div class="cartlift-track"><div class="cartlift-progress"></div></div>
      <div class="cartlift-recommendation" hidden>
        <div class="cartlift-rec-copy"><span class="cartlift-rec-label">You may also like</span><strong class="cartlift-rec-title"></strong><span class="cartlift-rec-price"></span></div>
        <button class="cartlift-add" type="button">Add</button>
      </div>
    </div>`;

  const card = root.querySelector(".cartlift-card");
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

  closeButton.addEventListener("click", () => { root.hidden = true; });

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
    const subtotal = Number(cart.items_subtotal_price || cart.total_price || 0) / 100;
    const currency = cart.currency || "USD";
    const threshold = thresholdFor(currency);
    const remaining = Math.max(0, threshold - subtotal);
    const percent = Math.min(100, Math.round((subtotal / threshold) * 100));
    progress.style.width = `${percent}%`;
    message.textContent = remaining > 0
      ? `Add ${money(remaining, currency)} more for free shipping`
      : "🎉 You unlocked free shipping";
    card.dataset.empty = cart.item_count ? "false" : "true";
  }

  async function load() {
    if (loading) return;
    loading = true;
    try {
      const cart = await getCart();
      if (!cart.item_count) {
        root.hidden = true;
        currentRecommendation = null;
        recommendation.hidden = true;
        return;
      }
      root.hidden = false;
      renderCart(cart);
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
    }
  }

  function scheduleLoad() {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(load, 180);
  }

  addButton.addEventListener("click", async () => {
    const variantId = currentRecommendation?.variants?.[0]?.id;
    if (!variantId) return;
    addButton.disabled = true;
    addButton.textContent = "Adding…";
    try {
      const response = await fetch(addUrl, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ items: [{ id: variantId, quantity: 1 }] }),
      });
      if (!response.ok) throw new Error("add failed");
      window.dispatchEvent(new CustomEvent("cartlift:cart-updated"));
      document.dispatchEvent(new CustomEvent("cart:refresh", { bubbles: true }));
      await load();
      addButton.textContent = "Added";
      setTimeout(() => { addButton.textContent = "Add"; }, 1200);
    } catch (_) {
      addButton.disabled = false;
      addButton.textContent = "Retry";
    }
  });

  document.addEventListener("cart:updated", scheduleLoad);
  document.addEventListener("cart:refresh", scheduleLoad);
  document.addEventListener("cart:change", scheduleLoad);
  window.addEventListener("cart:change", scheduleLoad);
  window.addEventListener("pageshow", scheduleLoad);

  // Detect Shopify Ajax Cart API calls even when the theme does not emit a cart event.
  const originalFetch = window.fetch;
  window.fetch = function(input, init) {
    const requestUrl = typeof input === "string" ? input : input?.url || "";
    const result = originalFetch.apply(this, arguments);
    if (/\/cart\/(add|change|update|clear)(\.js)?(?:[?#]|$)/.test(requestUrl)) {
      result.then(() => scheduleLoad()).catch(() => {});
    }
    return result;
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url) {
    this.__cartliftCartRequest = typeof url === "string" && /\/cart\/(add|change|update|clear)(\.js)?(?:[?#]|$)/.test(url);
    return originalOpen.apply(this, arguments);
  };
  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function() {
    if (this.__cartliftCartRequest) this.addEventListener("load", scheduleLoad, { once: true });
    return originalSend.apply(this, arguments);
  };

  load();
})();

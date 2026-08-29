(() => {
  const root = document.getElementById("cartlift-root");
  if (!root) return;

  const money = (cents) => {
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: (window.Shopify && Shopify.currency && Shopify.currency.active) || "USD"
      }).format(cents / 100);
    } catch {
      return `${(cents / 100).toFixed(2)}`;
    }
  };

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  }[char]));

  const routesRoot = (window.Shopify && Shopify.routes && Shopify.routes.root) || "/";
  const threshold = Number(root.dataset.freeShippingThreshold || 0);

  const fetchCart = () => fetch(`${routesRoot}cart.js`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" }
  }).then((response) => {
    if (!response.ok) throw new Error(`Cart request failed: ${response.status}`);
    return response.json();
  });

  const fetchRecommendation = (productId) => fetch(
    `${routesRoot}recommendations/products.json?product_id=${encodeURIComponent(productId)}&limit=4&intent=complementary`,
    { credentials: "same-origin", headers: { Accept: "application/json" } }
  ).then((response) => response.ok ? response.json() : { products: [] });

  const render = (cart, recommendation) => {
    if (!cart || !cart.item_count) {
      root.hidden = true;
      root.innerHTML = "";
      return;
    }

    const cartIds = new Set((cart.items || []).map((item) => Number(item.product_id)));
    const product = (recommendation?.products || []).find((item) => !cartIds.has(Number(item.id)));
    const remaining = Math.max(threshold - Number(cart.total_price || 0), 0);
    const progress = threshold > 0 ? Math.min((Number(cart.total_price || 0) / threshold) * 100, 100) : 0;

    root.innerHTML = `
      <section class="cartlift-card" aria-label="CartLift shopping assistant">
        <div class="cartlift-card__header">
          <div>
            <span class="cartlift-eyebrow">CartLift</span>
            <strong>${remaining > 0 && threshold > 0 ? `You're ${money(remaining)} away` : "You're on track"}</strong>
          </div>
          <button class="cartlift-close" type="button" aria-label="Close CartLift">×</button>
        </div>
        ${threshold > 0 ? `
          <div class="cartlift-progress" aria-hidden="true"><span style="width:${progress}%"></span></div>
          <p class="cartlift-copy">${remaining > 0 ? `Add a little more to reach your ${money(threshold)} goal.` : `You've reached your ${money(threshold)} goal.`}</p>
        ` : ""}
        ${product ? `
          <div class="cartlift-recommendation">
            <img src="${escapeHtml(product.featured_image || product.images?.[0] || "")}" alt="${escapeHtml(product.title)}" loading="lazy">
            <div class="cartlift-recommendation__body">
              <span class="cartlift-eyebrow">Recommended for your cart</span>
              <strong>${escapeHtml(product.title)}</strong>
              <span>${money(Number(product.price || 0) * 100)}</span>
              <button class="cartlift-add" type="button" data-variant-id="${escapeHtml(product.variants?.[0]?.id || "")}">Add to cart</button>
            </div>
          </div>
        ` : ""}
      </section>
    `;

    root.hidden = false;

    root.querySelector(".cartlift-close")?.addEventListener("click", () => {
      root.hidden = true;
      sessionStorage.setItem("cartlift-dismissed", "1");
    });

    root.querySelector(".cartlift-add")?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      const variantId = button.dataset.variantId;
      if (!variantId) return;
      button.disabled = true;
      button.textContent = "Adding…";
      try {
        const response = await fetch(`${routesRoot}cart/add.js`, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ items: [{ id: Number(variantId), quantity: 1 }] })
        });
        if (!response.ok) throw new Error(`Add failed: ${response.status}`);
        window.dispatchEvent(new CustomEvent("cartlift:cart-updated"));
        document.dispatchEvent(new CustomEvent("cart:updated", { bubbles: true }));
        await refresh();
        button.textContent = "Added";
      } catch {
        button.disabled = false;
        button.textContent = "Try again";
      }
    });
  };

  let refreshTimer;
  const refresh = async () => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(async () => {
      try {
        const cart = await fetchCart();
        if (!cart.item_count) return render(cart, null);
        const firstProductId = cart.items?.[0]?.product_id;
        const recommendation = firstProductId ? await fetchRecommendation(firstProductId) : { products: [] };
        render(cart, recommendation);
      } catch {
        root.hidden = true;
      }
    }, 120);
  };

  if (sessionStorage.getItem("cartlift-dismissed") !== "1") refresh();
  window.addEventListener("cartlift:cart-updated", refresh);
  window.addEventListener("pageshow", refresh);
})();

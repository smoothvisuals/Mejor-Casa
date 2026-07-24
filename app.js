(function () {
  "use strict";

  const CART_KEY = "bw_cart_v1";
  const CUSTOMER_KEY = "bw_customer_v1";

  let catalog = [];
  let categories = [];
  let cart = loadCart();
  let currentSearch = "";
  let currentSort = "default";
  let currentCategory = "Todos";

  const app = document.getElementById("app");

  function loadCart() {
    try {
      return JSON.parse(localStorage.getItem(CART_KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function saveCart() {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }

  function loadCustomer() {
    try {
      return JSON.parse(localStorage.getItem(CUSTOMER_KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function saveCustomer(data) {
    localStorage.setItem(CUSTOMER_KEY, JSON.stringify(data));
  }

  function money(n) {
    return "$" + n.toLocaleString("es-MX");
  }

  function findProduct(id) {
    return catalog.find((p) => p.id === id);
  }

  function cartCount() {
    return Object.values(cart).reduce((a, b) => a + b, 0);
  }

  function cartSubtotal() {
    let total = 0;
    for (const id in cart) {
      const p = findProduct(id);
      if (p) total += (p.comboPrice || p.price) * cart[id];
    }
    return total;
  }

  function addToCart(id, qty) {
    cart[id] = (cart[id] || 0) + qty;
    if (cart[id] <= 0) delete cart[id];
    saveCart();
    renderCartBar();
  }

  function setCartQty(id, qty) {
    if (qty <= 0) delete cart[id];
    else cart[id] = qty;
    saveCart();
  }

  // ---------- Routing ----------
  function parseHash() {
    const h = location.hash.replace(/^#\/?/, "");
    const parts = h.split("/").filter(Boolean);
    return parts;
  }

  function navigate(path) {
    location.hash = path;
  }

  function router() {
    const parts = parseHash();
    window.scrollTo(0, 0);
    if (parts[0] === "product" && parts[1]) {
      renderProductDetail(parts[1]);
    } else if (parts[0] === "cart") {
      renderCart();
    } else if (parts[0] === "checkout") {
      renderCheckout();
    } else if (parts[0] === "payment") {
      renderPayment();
    } else if (parts[0] === "confirmation") {
      renderConfirmation();
    } else {
      renderHome();
    }
  }

  window.addEventListener("hashchange", router);

  // ---------- Shared bits ----------
  function header({ title, showBack, showSearch }) {
    let html = `<header class="app-header"><div class="title-row">`;
    if (showBack) {
      html += `<button class="back-btn" data-action="back">&larr;</button>`;
    }
    html += `<h1>${title}</h1>`;
    if (!showBack) {
      html += `<button class="back-btn" data-action="go-cart" aria-label="Carrito" style="font-size:16px;">🛒</button>`;
    }
    html += `</div>`;
    if (showSearch) {
      html += `
        <div class="search-row">
          <input type="search" id="searchInput" placeholder="Buscar producto..." value="${escapeAttr(currentSearch)}">
          <select class="sort-select" id="sortSelect">
            <option value="default" ${currentSort === "default" ? "selected" : ""}>Catálogo</option>
            <option value="price-asc" ${currentSort === "price-asc" ? "selected" : ""}>Precio ↑</option>
            <option value="price-desc" ${currentSort === "price-desc" ? "selected" : ""}>Precio ↓</option>
          </select>
        </div>
        <div class="category-row" id="categoryRow">
          ${["Todos", ...categories]
            .map(
              (c) =>
                `<button class="cat-chip ${c === currentCategory ? "active" : ""}" data-cat="${escapeAttr(c)}">${escapeHtml(c)}</button>`
            )
            .join("")}
        </div>`;
    }
    html += `</header>`;
    return html;
  }

  function escapeAttr(s) {
    return String(s).replace(/"/g, "&quot;");
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function cartBarHtml() {
    const count = cartCount();
    if (count === 0) return "";
    return `
      <div class="cart-bar" id="cartBar">
        <div>
          <div class="count">${count} artículo${count === 1 ? "" : "s"}</div>
          <div class="subtotal">${money(cartSubtotal())}</div>
        </div>
        <button class="view-btn" data-action="go-cart">Ver pedido</button>
      </div>`;
  }

  function renderCartBar() {
    const existing = document.getElementById("cartBar");
    const html = cartBarHtml();
    if (existing) {
      if (!html) existing.remove();
      else existing.outerHTML = html;
    } else if (html) {
      app.insertAdjacentHTML("afterend", html);
    }
  }

  function hideCartBar() {
    const existing = document.getElementById("cartBar");
    if (existing) existing.remove();
  }

  function productCardHtml(p) {
    const hasCombo = p.comboPrice && p.comboPrice < p.price;
    return `
      <div class="product-card" data-id="${p.id}">
        <button class="thumb-wrap" data-action="open" data-id="${p.id}" style="border:none;padding:0;width:100%;">
          <img src="${p.image}" alt="${escapeAttr(p.name)}" loading="lazy">
        </button>
        <div class="info">
          <button class="name" data-action="open" data-id="${p.id}" style="background:none;padding:0;text-align:left;">${escapeHtml(p.name)}</button>
          <div class="price-row">
            <span class="price-now">${money(hasCombo ? p.comboPrice : p.price)}</span>
            ${hasCombo ? `<span class="price-was">${money(p.price)}</span>` : ""}
          </div>
          <button class="add-btn" data-action="quick-add" data-id="${p.id}">Agregar</button>
        </div>
      </div>`;
  }

  function getFilteredSorted() {
    let items = catalog;
    if (currentCategory !== "Todos") {
      items = items.filter((p) => p.category === currentCategory);
    }
    if (currentSearch.trim()) {
      const q = normalize(currentSearch);
      items = items.filter((p) => normalize(p.name).includes(q) || p.id.includes(q));
    }
    items = items.slice();
    if (currentSort === "price-asc") {
      items.sort((a, b) => (a.comboPrice || a.price) - (b.comboPrice || b.price));
    } else if (currentSort === "price-desc") {
      items.sort((a, b) => (b.comboPrice || b.price) - (a.comboPrice || a.price));
    }
    return items;
  }

  function normalize(s) {
    return String(s)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
  }

  // ---------- Screens ----------
  function renderHome() {
    const items = getFilteredSorted();
    app.innerHTML = `
      ${header({ title: window.STORE_CONFIG.storeName, showBack: false, showSearch: true })}
      <div class="grid" id="grid">
        ${items.length ? items.map(productCardHtml).join("") : `<div class="empty-state" style="grid-column:1/-1;">No se encontraron productos.</div>`}
      </div>
    `;
    renderCartBar();

    document.getElementById("searchInput").addEventListener("input", (e) => {
      currentSearch = e.target.value;
      document.getElementById("grid").innerHTML = getFilteredSorted().length
        ? getFilteredSorted().map(productCardHtml).join("")
        : `<div class="empty-state" style="grid-column:1/-1;">No se encontraron productos.</div>`;
    });
    document.getElementById("sortSelect").addEventListener("change", (e) => {
      currentSort = e.target.value;
      document.getElementById("grid").innerHTML = getFilteredSorted().map(productCardHtml).join("");
    });
    document.getElementById("categoryRow").addEventListener("click", (e) => {
      const chip = e.target.closest(".cat-chip");
      if (!chip) return;
      currentCategory = chip.dataset.cat;
      renderHome();
    });
  }

  function renderProductDetail(id) {
    const p = findProduct(id);
    if (!p) {
      navigate("/");
      return;
    }
    const hasCombo = p.comboPrice && p.comboPrice < p.price;
    let qty = 1;

    app.innerHTML = `
      ${header({ title: "Producto", showBack: true })}
      <div class="detail">
        <div class="hero"><img src="${p.image}" alt="${escapeAttr(p.name)}"></div>
        <div class="body">
          <h2>${escapeHtml(p.name)}</h2>
          <div class="price-row">
            <span class="price-now">${money(hasCombo ? p.comboPrice : p.price)}</span>
            ${hasCombo ? `<span class="price-was">${money(p.price)}</span>` : ""}
          </div>
          ${hasCombo ? `<div class="notice" style="margin-top:6px;">Precio especial al comprar 3 productos del catálogo. Consulta condiciones con tu consultora.</div>` : ""}
          <div class="sku">Código: ${p.id}</div>
          <div class="qty-row">
            <button class="qty-btn" id="qtyMinus">−</button>
            <span class="qty-value" id="qtyValue">1</span>
            <button class="qty-btn" id="qtyPlus">+</button>
          </div>
          <button class="primary-btn coral" id="addToCartBtn">Agregar al pedido</button>
        </div>
      </div>
    `;
    renderCartBar();

    document.getElementById("qtyMinus").addEventListener("click", () => {
      qty = Math.max(1, qty - 1);
      document.getElementById("qtyValue").textContent = qty;
    });
    document.getElementById("qtyPlus").addEventListener("click", () => {
      qty = qty + 1;
      document.getElementById("qtyValue").textContent = qty;
    });
    document.getElementById("addToCartBtn").addEventListener("click", () => {
      addToCart(id, qty);
      document.getElementById("addToCartBtn").textContent = "¡Agregado!";
      setTimeout(() => navigate("/cart"), 350);
    });
  }

  function renderCart() {
    const ids = Object.keys(cart);
    let itemsHtml = "";
    if (ids.length === 0) {
      itemsHtml = `<div class="empty-state">Tu pedido está vacío.<br><br><button class="secondary-btn" data-action="back-home" style="width:auto;padding:10px 20px;">Ver catálogo</button></div>`;
    } else {
      itemsHtml = ids
        .map((id) => {
          const p = findProduct(id);
          if (!p) return "";
          const qty = cart[id];
          const unit = p.comboPrice && p.comboPrice < p.price ? p.comboPrice : p.price;
          return `
            <div class="cart-item" data-id="${id}">
              <img src="${p.image}" alt="">
              <div class="details">
                <div class="name">${escapeHtml(p.name)}</div>
                <div class="qty-row">
                  <button class="qty-btn" data-action="cart-minus" data-id="${id}">−</button>
                  <span class="qty-value">${qty}</span>
                  <button class="qty-btn" data-action="cart-plus" data-id="${id}">+</button>
                  <button class="remove" data-action="cart-remove" data-id="${id}">Quitar</button>
                </div>
              </div>
              <div style="font-weight:700;">${money(unit * qty)}</div>
            </div>`;
        })
        .join("");
    }

    app.innerHTML = `
      ${header({ title: "Tu pedido", showBack: true })}
      <div class="screen-body">
        ${itemsHtml}
        ${
          ids.length
            ? `
          <div class="summary-row total">
            <span>Total</span>
            <span>${money(cartSubtotal())}</span>
          </div>
          <div style="height:16px;"></div>
          <button class="primary-btn" id="checkoutBtn">Continuar</button>
        `
            : ""
        }
      </div>
    `;
    hideCartBar();

    if (ids.length) {
      document.getElementById("checkoutBtn").addEventListener("click", () => navigate("/checkout"));
    }
  }

  function renderCheckout() {
    if (cartCount() === 0) {
      navigate("/");
      return;
    }
    const saved = loadCustomer();
    app.innerHTML = `
      ${header({ title: "Tus datos", showBack: true })}
      <div class="screen-body">
        <div class="form-group">
          <label for="custName">Nombre completo</label>
          <input type="text" id="custName" value="${escapeAttr(saved.name || "")}" placeholder="Tu nombre">
        </div>
        <div class="form-group">
          <label for="custPhone">Teléfono</label>
          <input type="tel" id="custPhone" value="${escapeAttr(saved.phone || "")}" placeholder="10 dígitos">
        </div>
        <div class="form-group">
          <label for="custAddress">Dirección de entrega</label>
          <textarea id="custAddress" placeholder="Calle, número, colonia...">${escapeHtml(saved.address || "")}</textarea>
        </div>
        <div class="form-group">
          <label for="custNotes">Notas (opcional)</label>
          <textarea id="custNotes" placeholder="Referencias, horario, etc.">${escapeHtml(saved.notes || "")}</textarea>
        </div>
        <button class="primary-btn" id="toPaymentBtn">Continuar al pago</button>
      </div>
    `;
    hideCartBar();

    document.getElementById("toPaymentBtn").addEventListener("click", () => {
      const name = document.getElementById("custName").value.trim();
      const phone = document.getElementById("custPhone").value.trim();
      const address = document.getElementById("custAddress").value.trim();
      const notes = document.getElementById("custNotes").value.trim();
      if (!name || !phone) {
        alert("Por favor ingresa al menos tu nombre y teléfono.");
        return;
      }
      saveCustomer({ name, phone, address, notes });
      navigate("/payment");
    });
  }

  function renderPayment() {
    if (cartCount() === 0) {
      navigate("/");
      return;
    }
    const methods = [
      { id: "cash", label: "Efectivo al entregar", sub: "Pagas cuando recibes tu pedido" },
      { id: "transfer", label: "Transferencia / depósito", sub: "Te compartimos los datos por WhatsApp" },
      { id: "card", label: "Tarjeta (próximamente)", sub: "Aún no disponible en la app", disabled: true },
    ];
    let selected = "cash";

    app.innerHTML = `
      ${header({ title: "Método de pago", showBack: true })}
      <div class="screen-body">
        <div class="notice">Esta app aún no procesa pagos en línea. Elige cómo prefieres pagar y confirma tu pedido; tu consultora se pondrá en contacto para finalizarlo.</div>
        <div id="methodList">
          ${methods
            .map(
              (m) => `
            <label class="payment-option ${m.id === selected ? "selected" : ""} ${m.disabled ? "hidden" : ""}" data-id="${m.id}">
              <input type="radio" name="paymethod" value="${m.id}" ${m.id === selected ? "checked" : ""} ${m.disabled ? "disabled" : ""}>
              <div>
                <div class="label">${m.label}</div>
                <div class="sub">${m.sub}</div>
              </div>
            </label>`
            )
            .join("")}
        </div>
        <div class="summary-row total">
          <span>Total a pagar</span>
          <span>${money(cartSubtotal())}</span>
        </div>
        <div style="height:10px;"></div>
        <button class="primary-btn coral" id="confirmOrderBtn">Confirmar pedido por WhatsApp</button>
      </div>
    `;
    hideCartBar();

    document.querySelectorAll('input[name="paymethod"]').forEach((input) => {
      input.addEventListener("change", (e) => {
        selected = e.target.value;
        document.querySelectorAll(".payment-option").forEach((el) => {
          el.classList.toggle("selected", el.dataset.id === selected);
        });
      });
    });

    document.getElementById("confirmOrderBtn").addEventListener("click", () => {
      sendOrder(selected);
    });
  }

  function sendOrder(paymentMethod) {
    const customer = loadCustomer();
    const methodLabel = { cash: "Efectivo al entregar", transfer: "Transferencia / depósito", card: "Tarjeta" }[paymentMethod] || paymentMethod;

    let lines = [];
    lines.push(`Pedido - ${window.STORE_CONFIG.storeName}`);
    lines.push("");
    for (const id in cart) {
      const p = findProduct(id);
      if (!p) continue;
      const unit = p.comboPrice && p.comboPrice < p.price ? p.comboPrice : p.price;
      const qty = cart[id];
      lines.push(`• ${p.name} (${p.id}) x${qty} - ${money(unit * qty)}`);
    }
    lines.push("");
    lines.push(`Total: ${money(cartSubtotal())}`);
    lines.push(`Pago: ${methodLabel}`);
    lines.push("");
    lines.push(`Nombre: ${customer.name || ""}`);
    lines.push(`Teléfono: ${customer.phone || ""}`);
    if (customer.address) lines.push(`Dirección: ${customer.address}`);
    if (customer.notes) lines.push(`Notas: ${customer.notes}`);

    const text = encodeURIComponent(lines.join("\n"));
    const waUrl = `https://wa.me/${window.STORE_CONFIG.whatsappNumber}?text=${text}`;

    cart = {};
    saveCart();
    renderCartBar();

    window.open(waUrl, "_blank");
    navigate("/confirmation");
  }

  function renderConfirmation() {
    app.innerHTML = `
      ${header({ title: "Pedido enviado", showBack: false })}
      <div class="confirmation">
        <div class="icon">✅</div>
        <h2>¡Listo!</h2>
        <p>Tu pedido se abrió en WhatsApp para enviarlo. En cuanto tu consultora lo confirme, te dirá los siguientes pasos.</p>
        <button class="primary-btn" data-action="back-home" style="max-width:280px; margin:0 auto;">Volver al catálogo</button>
      </div>
    `;
    hideCartBar();
  }

  // ---------- Global click delegation ----------
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const action = el.dataset.action;
    if (action === "open") navigate(`/product/${el.dataset.id}`);
    else if (action === "quick-add") {
      addToCart(el.dataset.id, 1);
      el.textContent = "✓";
      setTimeout(() => (el.textContent = "Agregar"), 700);
    } else if (action === "go-cart") navigate("/cart");
    else if (action === "back") history.back();
    else if (action === "back-home") navigate("/");
    else if (action === "cart-plus") {
      cart[el.dataset.id] = (cart[el.dataset.id] || 0) + 1;
      saveCart();
      renderCart();
    } else if (action === "cart-minus") {
      const id = el.dataset.id;
      setCartQty(id, (cart[id] || 0) - 1);
      renderCart();
    } else if (action === "cart-remove") {
      delete cart[el.dataset.id];
      saveCart();
      renderCart();
    }
  });

  // ---------- Install banner ----------
  let deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (!localStorage.getItem("bw_install_dismissed")) {
      showInstallBanner();
    }
  });

  function showInstallBanner() {
    const banner = document.createElement("div");
    banner.className = "install-banner";
    banner.innerHTML = `
      <span>📲 Instala esta app en tu teléfono para verla cuando quieras, sin buscarla de nuevo.</span>
      <button id="installBtn">Instalar</button>
      <button class="dismiss" id="dismissInstall">✕</button>
    `;
    document.body.insertBefore(banner, app);
    banner.querySelector("#installBtn").addEventListener("click", async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        await deferredPrompt.userChoice;
        deferredPrompt = null;
      }
      banner.remove();
    });
    banner.querySelector("#dismissInstall").addEventListener("click", () => {
      localStorage.setItem("bw_install_dismissed", "1");
      banner.remove();
    });
  }

  // ---------- Init ----------
  fetch("catalog.json")
    .then((r) => r.json())
    .then((data) => {
      catalog = data;
      const counts = {};
      catalog.forEach((p) => {
        if (p.category) counts[p.category] = (counts[p.category] || 0) + 1;
      });
      categories = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
      router();
    })
    .catch(() => {
      app.innerHTML = `<div class="empty-state">No se pudo cargar el catálogo. Revisa tu conexión e intenta de nuevo.</div>`;
    });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("service-worker.js").catch(() => {});
    });
  }
})();

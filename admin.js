(function () {
  "use strict";

  const TOKEN_KEY = "bw_admin_token";
  const AUTH_KEY = "bw_admin_authed";
  const cfg = window.ADMIN_CONFIG;

  const root = document.getElementById("admin-app");

  let catalog = [];
  let catalogSha = null;
  let search = "";
  let categories = [];

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ---------- GitHub API helpers ----------
  function token() {
    return localStorage.getItem(TOKEN_KEY) || "";
  }

  function authHeaders(extra) {
    const h = Object.assign({ Accept: "application/vnd.github+json" }, extra || {});
    const t = token();
    if (t) h.Authorization = `Bearer ${t}`;
    return h;
  }

  async function ghGet(path) {
    // Public repo: reads work without a token. A token is only required to save (PUT).
    const res = await fetch(
      `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${path}?ref=${cfg.branch}`,
      { headers: authHeaders() }
    );
    if (!res.ok) throw new Error(`GitHub GET ${path} failed: ${res.status}`);
    const data = await res.json();
    return { content: decodeURIComponent(escape(atob(data.content))), sha: data.sha };
  }

  async function ghPutText(path, text, sha, message) {
    const body = {
      message,
      content: btoa(unescape(encodeURIComponent(text))),
      branch: cfg.branch,
    };
    if (sha) body.sha = sha;
    if (!token()) throw new Error("Falta el token de GitHub — agrégalo arriba para poder guardar.");
    const res = await fetch(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${path}`, {
      method: "PUT",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`GitHub PUT ${path} failed: ${res.status} ${errText}`);
    }
    return res.json();
  }

  async function ghPutBase64(path, base64, message) {
    const body = { message, content: base64, branch: cfg.branch };
    if (!token()) throw new Error("Falta el token de GitHub — agrégalo arriba para poder guardar.");
    const res = await fetch(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${path}`, {
      method: "PUT",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`GitHub PUT ${path} failed: ${res.status} ${errText}`);
    }
    return res.json();
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // ---------- Screens ----------
  function renderGate() {
    root.innerHTML = `
      <div class="admin-header"><h1>Panel de administración</h1><div class="sub">Mejor Casa</div></div>
      <div class="gate-box">
        <h2>Ingresa tu PIN</h2>
        <input type="password" inputmode="numeric" id="pinInput" placeholder="••••••" autofocus>
        <button class="primary-btn" id="pinBtn">Entrar</button>
        <div id="pinError" class="status-msg err" style="display:none;">PIN incorrecto</div>
      </div>
    `;
    const tryEnter = () => {
      const val = document.getElementById("pinInput").value.trim();
      if (val === String(cfg.pin)) {
        sessionStorage.setItem(AUTH_KEY, "1");
        renderMain();
      } else {
        document.getElementById("pinError").style.display = "block";
      }
    };
    document.getElementById("pinBtn").addEventListener("click", tryEnter);
    document.getElementById("pinInput").addEventListener("keydown", (e) => {
      if (e.key === "Enter") tryEnter();
    });
  }

  function tokenBoxHtml() {
    const t = token();
    if (t) {
      return `
        <div class="token-box connected">
          <label>Token de GitHub conectado ✓</label>
          <div class="help">Guardado solo en este navegador. <button id="clearTokenBtn" style="background:none;color:var(--coral);font-weight:700;padding:0;">Quitar token</button></div>
        </div>`;
    }
    return `
      <div class="token-box">
        <label>Token de GitHub (necesario para guardar cambios)</label>
        <input type="password" id="tokenInput" placeholder="ghp_...">
        <button class="primary-btn" id="saveTokenBtn" style="padding:10px;">Guardar token</button>
        <div class="help" style="margin-top:8px;">
          Créalo en GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens.
          Dale acceso solo al repositorio <b>${esc(cfg.repo)}</b> con permiso <b>Contents: Read and write</b>.
          Se guarda solo en este navegador y se usa únicamente para guardar cambios en tu catálogo.
        </div>
      </div>`;
  }

  async function renderMain() {
    root.innerHTML = `
      <div class="admin-header"><h1>Panel de administración</h1><div class="sub">Mejor Casa — editar catálogo</div></div>
      <div class="admin-body">
        ${tokenBoxHtml()}
        <div id="statusArea"></div>
        <div id="listArea">Cargando catálogo...</div>
      </div>
    `;
    wireTokenBox();

    try {
      const { content, sha } = await ghGet("catalog.json");
      catalog = JSON.parse(content);
      catalogSha = sha;
      const counts = {};
      catalog.forEach((p) => { if (p.category) counts[p.category] = (counts[p.category] || 0) + 1; });
      categories = Object.keys(counts).sort();
      renderList();
    } catch (e) {
      document.getElementById("listArea").innerHTML = `<div class="status-msg err">No se pudo cargar el catálogo: ${esc(e.message)}. Revisa tu token.</div>`;
    }
  }

  function wireTokenBox() {
    const saveBtn = document.getElementById("saveTokenBtn");
    if (saveBtn) {
      saveBtn.addEventListener("click", () => {
        const val = document.getElementById("tokenInput").value.trim();
        if (val) {
          localStorage.setItem(TOKEN_KEY, val);
          renderMain();
        }
      });
    }
    const clearBtn = document.getElementById("clearTokenBtn");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        localStorage.removeItem(TOKEN_KEY);
        renderMain();
      });
    }
  }

  function renderList() {
    const q = search.trim().toLowerCase();
    const items = q
      ? catalog.filter((p) => p.name.toLowerCase().includes(q) || p.id.includes(q))
      : catalog;

    document.getElementById("listArea").innerHTML = `
      <button class="new-product-btn" id="newProductBtn">+ Agregar producto nuevo</button>
      <div class="admin-toolbar">
        <input type="search" id="adminSearch" placeholder="Buscar producto o código..." value="${esc(search)}">
      </div>
      <div style="font-size:12.5px;color:var(--text-muted);margin-bottom:10px;">${items.length} de ${catalog.length} productos</div>
      <div id="itemsList">
        ${items
          .slice(0, 200)
          .map(
            (p) => `
          <div class="admin-list-item">
            <img src="${esc(p.image)}" alt="">
            <div class="info">
              <div class="name">${esc(p.name)}</div>
              <div class="meta">${esc(p.id)} · $${p.price}${p.comboPrice ? " / $" + p.comboPrice : ""} · ${esc(p.category || "Sin categoría")}</div>
            </div>
            <button data-id="${esc(p.id)}" class="edit-btn">Editar</button>
          </div>`
          )
          .join("")}
      </div>
      ${items.length > 200 ? `<div class="status-msg pending">Mostrando los primeros 200 resultados. Usa la búsqueda para acotar.</div>` : ""}
    `;

    document.getElementById("adminSearch").addEventListener("input", (e) => {
      search = e.target.value;
      renderList();
    });
    document.getElementById("newProductBtn").addEventListener("click", () => openEditSheet(null));
    document.querySelectorAll(".edit-btn").forEach((btn) => {
      btn.addEventListener("click", () => openEditSheet(btn.dataset.id));
    });
  }

  function openEditSheet(id) {
    const isNew = id === null;
    const p = isNew ? { id: "", name: "", price: "", comboPrice: "", category: "", image: "" } : catalog.find((x) => x.id === id);
    if (!p) return;

    const overlay = document.createElement("div");
    overlay.className = "edit-panel";
    overlay.innerHTML = `
      <div class="sheet">
        <h3>${isNew ? "Nuevo producto" : "Editar producto"}</h3>
        ${p.image ? `<img class="preview-img" id="previewImg" src="${esc(p.image)}">` : `<div id="previewImg"></div>`}
        <div class="form-group">
          <label>Código (SKU)</label>
          <input type="text" id="f_id" value="${esc(p.id)}" ${isNew ? "" : "disabled"}>
        </div>
        <div class="form-group">
          <label>Nombre</label>
          <input type="text" id="f_name" value="${esc(p.name)}">
        </div>
        <div class="form-group">
          <label>Precio normal</label>
          <input type="number" id="f_price" value="${esc(p.price)}">
        </div>
        <div class="form-group">
          <label>Precio especial (opcional, dejar vacío si no aplica)</label>
          <input type="number" id="f_combo" value="${p.comboPrice != null ? esc(p.comboPrice) : ""}">
        </div>
        <div class="form-group">
          <label>Categoría</label>
          <input type="text" id="f_category" value="${esc(p.category || "")}" list="catList">
          <datalist id="catList">${categories.map((c) => `<option value="${esc(c)}">`).join("")}</datalist>
        </div>
        <div class="form-group">
          <label>Reemplazar imagen (opcional)</label>
          <input type="file" id="f_image" accept="image/*">
        </div>
        <div id="editStatus"></div>
        <div class="actions">
          <button class="btn-cancel" id="cancelBtn">Cancelar</button>
          ${isNew ? "" : `<button class="btn-delete" id="deleteBtn">Eliminar</button>`}
          <button class="btn-save" id="saveBtn">Guardar</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById("f_image").addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      const previewEl = document.getElementById("previewImg");
      if (previewEl.tagName === "IMG") previewEl.src = url;
      else previewEl.outerHTML = `<img class="preview-img" id="previewImg" src="${url}">`;
    });

    overlay.querySelector("#cancelBtn").addEventListener("click", () => overlay.remove());

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.remove();
    });

    if (!isNew) {
      overlay.querySelector("#deleteBtn").addEventListener("click", async () => {
        if (!confirm(`¿Eliminar "${p.name}"? Esta acción no se puede deshacer.`)) return;
        await withStatus(overlay, async () => {
          catalog = catalog.filter((x) => x.id !== p.id);
          await saveCatalog(`Eliminar producto ${p.id} vía admin`);
          overlay.remove();
          renderList();
        });
      });
    }

    overlay.querySelector("#saveBtn").addEventListener("click", async () => {
      const newId = document.getElementById("f_id").value.trim();
      const name = document.getElementById("f_name").value.trim();
      const price = parseInt(document.getElementById("f_price").value, 10);
      const comboRaw = document.getElementById("f_combo").value.trim();
      const comboPrice = comboRaw === "" ? null : parseInt(comboRaw, 10);
      const category = document.getElementById("f_category").value.trim() || "Otros";
      const imageFile = document.getElementById("f_image").files[0];

      if (!newId || !name || isNaN(price)) {
        alert("Código, nombre y precio son obligatorios.");
        return;
      }
      if (isNew && catalog.some((x) => x.id === newId)) {
        alert("Ya existe un producto con ese código.");
        return;
      }

      await withStatus(overlay, async () => {
        let imagePath = p.image || "";
        if (imageFile) {
          const base64 = await fileToBase64(imageFile);
          const ext = (imageFile.name.split(".").pop() || "jpg").toLowerCase();
          imagePath = `images/admin_${newId}_${Date.now()}.${ext}`;
          await ghPutBase64(imagePath, base64, `Subir imagen para ${newId} vía admin`);
        }

        const updated = { id: newId, name, price, comboPrice, category, image: imagePath, page: p.page || null };
        if (isNew) {
          catalog.push(updated);
        } else {
          const i = catalog.findIndex((x) => x.id === p.id);
          catalog[i] = updated;
        }
        await saveCatalog(`${isNew ? "Agregar" : "Editar"} producto ${newId} vía admin`);
        overlay.remove();
        renderList();
      });
    });
  }

  async function withStatus(overlay, fn) {
    const statusEl = overlay.querySelector("#editStatus");
    statusEl.innerHTML = `<div class="status-msg pending">Guardando...</div>`;
    try {
      await fn();
    } catch (e) {
      statusEl.innerHTML = `<div class="status-msg err">Error: ${esc(e.message)}</div>`;
    }
  }

  async function saveCatalog(message) {
    const text = JSON.stringify(catalog, null, 2);
    const result = await ghPutText("catalog.json", text, catalogSha, message);
    catalogSha = result.content.sha;
    const statusArea = document.getElementById("statusArea");
    if (statusArea) {
      statusArea.innerHTML = `<div class="status-msg ok">Guardado. Los cambios estarán visibles para tus clientes en 1-2 minutos.</div>`;
      setTimeout(() => { statusArea.innerHTML = ""; }, 5000);
    }
  }

  // ---------- Init ----------
  if (sessionStorage.getItem(AUTH_KEY) === "1") {
    renderMain();
  } else {
    renderGate();
  }
})();

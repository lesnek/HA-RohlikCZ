class RohlikczShoppingListCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._items = [];
    this._listName = "";
    this._loading = false;
    this._error = null;
    this._addingAll = false;
    this._addResults = [];
  }

  setConfig(config) {
    if (!config.config_entry_id) {
      throw new Error("config_entry_id is required");
    }
    if (!config.shopping_list_id) {
      throw new Error("shopping_list_id is required");
    }
    this._config = config;
    this._domain = config.domain || "rohlikcz2";
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._loaded) {
      this._loaded = true;
      this._fetchList();
    }
  }

  async _fetchList() {
    this._loading = true;
    this._error = null;
    this._addResults = [];
    this._render();

    try {
      const result = await this._hass.callService(
        this._domain,
        "get_shopping_list",
        {
          config_entry_id: this._config.config_entry_id,
          shopping_list_id: this._config.shopping_list_id,
        },
        undefined,
        true,
        true
      );
      this._listName = result.response?.name || "";
      this._items = result.response?.products_in_list || [];
    } catch (e) {
      this._error = e.message || "Failed to load shopping list";
    }

    this._loading = false;
    this._render();
  }

  async _addAllToCart() {
    this._addingAll = true;
    this._addResults = [];
    this._render();

    const results = [];
    for (const product of this._items) {
      try {
        await this._hass.callService(
          this._domain,
          "add_to_cart",
          {
            config_entry_id: this._config.config_entry_id,
            product_id: product.productId ?? product.id,
            quantity: 1,
          },
          undefined,
          true,
          true
        );
        results.push({ name: product.productName ?? product.name, ok: true });
      } catch (e) {
        results.push({ name: product.productName ?? product.name, ok: false, error: e.message });
      }
    }

    this._addResults = results;
    this._addingAll = false;
    this._render();
  }

  async _addItemToCart(product) {
    const name = product.productName ?? product.name ?? product.productId ?? product.id;
    try {
      await this._hass.callService(
        this._domain,
        "add_to_cart",
        {
          config_entry_id: this._config.config_entry_id,
          product_id: product.productId ?? product.id,
          quantity: 1,
        },
        undefined,
        true,
        true
      );
      this._showToast(`✓ ${name} added to cart`);
    } catch (e) {
      this._showToast(`✗ Failed: ${e.message}`, true);
    }
  }

  _showToast(msg, isError = false) {
    const toast = this.shadowRoot.querySelector(".toast");
    if (!toast) return;
    toast.textContent = msg;
    toast.style.background = isError ? "var(--error-color, #c62828)" : "var(--success-color, #2e7d32)";
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(8px)";
    }, 2500);
  }

  _render() {
    const config = this._config || {};
    const title = config.title || this._listName || "Shopping List";

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          font-family: var(--paper-font-body1_-_font-family, sans-serif);
        }
        ha-card {
          padding: 0;
          overflow: hidden;
        }
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 16px 8px;
          border-bottom: 1px solid var(--divider-color, rgba(0,0,0,0.12));
        }
        .header-left {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .header-icon {
          color: var(--primary-color, #03a9f4);
          font-size: 22px;
        }
        .title {
          font-size: 1.1rem;
          font-weight: 500;
          color: var(--primary-text-color);
        }
        .subtitle {
          font-size: 0.8rem;
          color: var(--secondary-text-color);
          margin-top: 2px;
        }
        .actions {
          display: flex;
          gap: 8px;
        }
        .btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 14px;
          border: none;
          border-radius: 20px;
          cursor: pointer;
          font-size: 0.82rem;
          font-weight: 500;
          transition: opacity 0.15s, background 0.15s;
        }
        .btn:disabled {
          opacity: 0.5;
          cursor: default;
        }
        .btn-primary {
          background: var(--primary-color, #03a9f4);
          color: #fff;
        }
        .btn-secondary {
          background: var(--secondary-background-color, #f5f5f5);
          color: var(--primary-text-color);
          border: 1px solid var(--divider-color, rgba(0,0,0,0.12));
        }
        .item-list {
          list-style: none;
          margin: 0;
          padding: 0;
        }
        .item {
          display: flex;
          align-items: center;
          padding: 10px 16px;
          border-bottom: 1px solid var(--divider-color, rgba(0,0,0,0.07));
          gap: 12px;
          transition: background 0.1s;
        }
        .item:last-child {
          border-bottom: none;
        }
        .item:hover {
          background: var(--secondary-background-color, rgba(0,0,0,0.03));
        }
        .item-icon {
          font-size: 20px;
          flex-shrink: 0;
          color: var(--secondary-text-color);
        }
        .item-info {
          flex: 1;
          min-width: 0;
        }
        .item-name {
          font-size: 0.9rem;
          font-weight: 500;
          color: var(--primary-text-color);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .item-meta {
          font-size: 0.78rem;
          color: var(--secondary-text-color);
          margin-top: 2px;
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .item-price {
          font-size: 0.85rem;
          font-weight: 500;
          color: var(--primary-color, #03a9f4);
          flex-shrink: 0;
          white-space: nowrap;
        }
        .add-btn {
          background: none;
          border: 1px solid var(--primary-color, #03a9f4);
          color: var(--primary-color, #03a9f4);
          border-radius: 50%;
          width: 30px;
          height: 30px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font-size: 18px;
          flex-shrink: 0;
          transition: background 0.15s, color 0.15s;
          padding: 0;
        }
        .add-btn:hover {
          background: var(--primary-color, #03a9f4);
          color: #fff;
        }
        .state-box {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 32px 16px;
          gap: 12px;
          color: var(--secondary-text-color);
          font-size: 0.9rem;
        }
        .spinner {
          width: 28px;
          height: 28px;
          border: 3px solid var(--divider-color, rgba(0,0,0,0.12));
          border-top-color: var(--primary-color, #03a9f4);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .error-icon { font-size: 28px; }
        .results-bar {
          padding: 8px 16px;
          font-size: 0.8rem;
          background: var(--secondary-background-color, #f5f5f5);
          border-top: 1px solid var(--divider-color, rgba(0,0,0,0.12));
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .result-chip {
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 0.75rem;
        }
        .result-ok { background: #e8f5e9; color: #2e7d32; }
        .result-fail { background: #ffebee; color: #c62828; }
        .toast {
          position: fixed;
          bottom: 24px;
          left: 50%;
          transform: translateX(-50%) translateY(8px);
          background: var(--success-color, #2e7d32);
          color: #fff;
          padding: 8px 20px;
          border-radius: 20px;
          font-size: 0.85rem;
          opacity: 0;
          transition: opacity 0.3s, transform 0.3s;
          z-index: 9999;
          pointer-events: none;
          white-space: nowrap;
        }
        .empty-icon { font-size: 28px; }
      </style>

      <ha-card>
        <div class="header">
          <div class="header-left">
            <span class="header-icon">🛒</span>
            <div>
              <div class="title">${this._escHtml(title)}</div>
              ${this._items.length > 0 ? `<div class="subtitle">${this._items.length} item${this._items.length !== 1 ? "s" : ""}</div>` : ""}
            </div>
          </div>
          <div class="actions">
            <button class="btn btn-secondary" id="refresh-btn" title="Refresh">↻ Refresh</button>
            ${this._items.length > 0 ? `<button class="btn btn-primary" id="add-all-btn" ${this._addingAll ? "disabled" : ""}>${this._addingAll ? "Adding…" : "Add all to cart"}</button>` : ""}
          </div>
        </div>

        ${this._renderBody()}

        ${this._addResults.length > 0 ? `
          <div class="results-bar">
            ${this._addResults.map(r => `<span class="result-chip ${r.ok ? "result-ok" : "result-fail"}">${this._escHtml(r.name)}: ${r.ok ? "✓ added" : "✗ failed"}</span>`).join("")}
          </div>
        ` : ""}
      </ha-card>

      <div class="toast"></div>
    `;

    this.shadowRoot.querySelector("#refresh-btn")?.addEventListener("click", () => {
      this._loaded = false;
      this._fetchList();
    });

    this.shadowRoot.querySelector("#add-all-btn")?.addEventListener("click", () => {
      this._addAllToCart();
    });

    this.shadowRoot.querySelectorAll(".add-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const idx = parseInt(e.currentTarget.dataset.idx, 10);
        this._addItemToCart(this._items[idx]);
      });
    });
  }

  _renderBody() {
    if (this._loading) {
      return `<div class="state-box"><div class="spinner"></div><span>Loading shopping list…</span></div>`;
    }
    if (this._error) {
      return `<div class="state-box"><span class="error-icon">⚠️</span><span>${this._escHtml(this._error)}</span></div>`;
    }
    if (this._items.length === 0) {
      return `<div class="state-box"><span class="empty-icon">📋</span><span>No items in this shopping list</span></div>`;
    }

    const rows = this._items.map((product, idx) => {
      const name = product.productName ?? product.name ?? `Product ${product.productId ?? product.id}`;
      const brand = product.brand ?? "";
      const amount = product.textualAmount ?? product.amount ?? "";
      const price = product.price
        ? (typeof product.price === "object"
            ? `${product.price.full ?? ""} ${product.price.currency ?? ""}`.trim()
            : product.price)
        : "";

      return `
        <li class="item">
          <span class="item-icon">🥦</span>
          <div class="item-info">
            <div class="item-name">${this._escHtml(name)}</div>
            <div class="item-meta">
              ${brand ? `<span>${this._escHtml(brand)}</span>` : ""}
              ${amount ? `<span>${this._escHtml(amount)}</span>` : ""}
            </div>
          </div>
          ${price ? `<span class="item-price">${this._escHtml(String(price))}</span>` : ""}
          <button class="add-btn" data-idx="${idx}" title="Add to cart">+</button>
        </li>
      `;
    });

    return `<ul class="item-list">${rows.join("")}</ul>`;
  }

  _escHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  getCardSize() {
    return Math.max(1, Math.ceil(this._items.length / 2) + 2);
  }

  static getConfigElement() {
    return document.createElement("rohlikcz-shopping-list-card-editor");
  }

  static getStubConfig() {
    return {
      config_entry_id: "",
      shopping_list_id: "",
      title: "Rohlik Shopping List",
    };
  }
}

customElements.define("rohlikcz-shopping-list-card", RohlikczShoppingListCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "rohlikcz-shopping-list-card",
  name: "Rohlik Shopping List",
  description: "Displays a Rohlik.cz shopping list and allows adding items to cart",
  preview: false,
});

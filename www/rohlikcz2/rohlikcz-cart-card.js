class RohlikczCartCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._products = [];
    this._totalPrice = 0;
    this._totalItems = 0;
    this._loading = false;
    this._error = null;
    this._imageCache = {};
    this._searchQuery = "";
    this._searchResults = [];
    this._searching = false;
    this._searchError = null;
    this._addingToCart = {};
  }

  setConfig(config) {
    if (!config.config_entry_id) {
      throw new Error("config_entry_id is required");
    }
    this._config = config;
    this._domain = config.domain || "rohlikcz2";
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._loaded) {
      this._loaded = true;
      this._fetchCart();
    }
  }

  async _fetchCart() {
    if (!this._hass || this._loading) return;
    this._loading = true;
    this._error = null;
    this._render();

    try {
      const result = await this._hass.callService(
        this._domain,
        "get_cart_content",
        { config_entry_id: this._config.config_entry_id },
        undefined,
        true,
        true
      );

      const data = result?.response || result;
      this._products = data?.products || [];
      this._totalPrice = data?.total_price || 0;
      this._totalItems = data?.total_items || 0;

      if (this._products.length > 0) {
        await this._fetchImages(this._products.map(p => p.id));
      }
    } catch (e) {
      this._error = e.message || "Failed to load cart";
    } finally {
      this._loading = false;
      this._render();
    }
  }

  async _fetchImages(productIds) {
    const uncached = productIds.filter(id => !this._imageCache[id]);
    if (uncached.length === 0) return;

    try {
      const params = uncached.map(id => `products=${id}`).join("&");
      const resp = await fetch(`https://www.rohlik.cz/api/v1/products?${params}`);
      if (!resp.ok) return;
      const items = await resp.json();
      for (const item of items) {
        this._imageCache[item.id] = {
          image: item.images?.[0] || null,
          textualAmount: item.textualAmount || null,
        };
      }
    } catch (_) {}
  }

  async _searchProducts(query) {
    if (!query || query.trim().length < 2) {
      this._searchResults = [];
      this._searchError = null;
      this._render();
      return;
    }
    this._searching = true;
    this._searchError = null;
    this._render();
    try {
      const result = await this._hass.callService(
        this._domain,
        "search_product",
        { config_entry_id: this._config.config_entry_id, product_name: query, limit: 10 },
        undefined, true, true
      );
      const data = result?.response || result;
      const raw = data?.search_results || [];
      this._searchResults = raw;
      if (raw.length > 0) {
        await this._fetchImages(raw.map(p => p.id));
      }
    } catch (e) {
      this._searchError = e.message || "Search failed";
      this._searchResults = [];
    } finally {
      this._searching = false;
      this._render();
    }
  }

  async _addToCart(productId) {
    this._addingToCart = { ...this._addingToCart, [productId]: true };
    this._render();
    try {
      await this._hass.callService(
        this._domain,
        "add_to_cart",
        { config_entry_id: this._config.config_entry_id, product_id: productId, quantity: 1 },
        undefined, true, true
      );
      this._loaded = false;
      await this._fetchCart();
    } catch (e) {
      this._error = `Failed to add item: ${e.message}`;
    } finally {
      this._addingToCart = { ...this._addingToCart, [productId]: false };
      this._render();
    }
  }

  async _removeFromCart(cartItemId) {
    try {
      await this._hass.callService(
        this._domain,
        "delete_from_cart",
        { config_entry_id: this._config.config_entry_id, order_field_id: cartItemId },
        undefined,
        true,
        true
      );
      await this._fetchCart();
    } catch (e) {
      this._error = `Failed to remove item: ${e.message}`;
      this._render();
    }
  }

  _render() {
    const title = this._config?.title || "Rohlik Cart";

    const style = `
      <style>
        :host { display: block; }
        .card {
          background: var(--card-background-color, #1c1c1c);
          border-radius: 12px;
          padding: 16px;
          font-family: var(--primary-font-family, sans-serif);
          color: var(--primary-text-color, #fff);
        }
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
        }
        .header-left {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .title {
          font-size: 1.1em;
          font-weight: 600;
        }
        .subtitle {
          font-size: 0.8em;
          color: var(--secondary-text-color, #aaa);
        }
        .refresh-btn {
          background: none;
          border: 1px solid var(--divider-color, #444);
          color: var(--primary-text-color, #fff);
          border-radius: 6px;
          padding: 4px 10px;
          cursor: pointer;
          font-size: 0.8em;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .refresh-btn:hover { background: var(--secondary-background-color, #2a2a2a); }
        .loading, .error, .empty {
          text-align: center;
          padding: 24px;
          color: var(--secondary-text-color, #aaa);
          font-size: 0.9em;
        }
        .error { color: var(--error-color, #f44336); }
        .item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 0;
          border-bottom: 1px solid var(--divider-color, #333);
        }
        .item:last-child { border-bottom: none; }
        .item-img {
          width: 52px;
          height: 52px;
          object-fit: contain;
          border-radius: 6px;
          background: #2a2a2a;
          flex-shrink: 0;
        }
        .item-img-placeholder {
          width: 52px;
          height: 52px;
          border-radius: 6px;
          background: var(--secondary-background-color, #2a2a2a);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          font-size: 1.4em;
        }
        .item-info {
          flex: 1;
          min-width: 0;
        }
        .item-name {
          font-size: 0.9em;
          font-weight: 500;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .item-meta {
          font-size: 0.75em;
          color: var(--secondary-text-color, #aaa);
          margin-top: 2px;
        }
        .item-right {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 6px;
          flex-shrink: 0;
        }
        .item-price {
          font-size: 0.95em;
          font-weight: 600;
          color: var(--primary-color, #03a9f4);
        }
        .item-qty {
          font-size: 0.8em;
          color: var(--secondary-text-color, #aaa);
        }
        .remove-btn {
          background: none;
          border: 1px solid var(--divider-color, #444);
          color: var(--secondary-text-color, #aaa);
          border-radius: 50%;
          width: 24px;
          height: 24px;
          cursor: pointer;
          font-size: 0.9em;
          display: flex;
          align-items: center;
          justify-content: center;
          line-height: 1;
        }
        .remove-btn:hover { border-color: var(--error-color, #f44336); color: var(--error-color, #f44336); }
        .footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 14px;
          padding-top: 12px;
          border-top: 1px solid var(--divider-color, #333);
          font-size: 0.95em;
        }
        .total-label { color: var(--secondary-text-color, #aaa); }
        .total-price { font-weight: 700; font-size: 1.1em; }
        .search-section {
          margin-bottom: 14px;
          padding-bottom: 14px;
          border-bottom: 1px solid var(--divider-color, #333);
        }
        .search-row {
          display: flex;
          gap: 8px;
        }
        .search-input {
          flex: 1;
          background: var(--secondary-background-color, #2a2a2a);
          border: 1px solid var(--divider-color, #444);
          border-radius: 6px;
          padding: 7px 10px;
          color: var(--primary-text-color, #fff);
          font-size: 0.9em;
          outline: none;
        }
        .search-input:focus { border-color: var(--primary-color, #03a9f4); }
        .search-btn {
          background: var(--primary-color, #03a9f4);
          border: none;
          border-radius: 6px;
          padding: 7px 14px;
          color: #fff;
          font-size: 0.85em;
          cursor: pointer;
          white-space: nowrap;
        }
        .search-btn:disabled { opacity: 0.5; cursor: default; }
        .search-results {
          margin-top: 8px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .search-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 6px 4px;
          border-radius: 6px;
        }
        .search-item:hover { background: var(--secondary-background-color, #2a2a2a); }
        .search-item-img {
          width: 40px;
          height: 40px;
          object-fit: contain;
          border-radius: 4px;
          background: #2a2a2a;
          flex-shrink: 0;
        }
        .search-item-placeholder {
          width: 40px;
          height: 40px;
          border-radius: 4px;
          background: var(--secondary-background-color, #2a2a2a);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          font-size: 1.1em;
        }
        .search-item-info { flex: 1; min-width: 0; }
        .search-item-name {
          font-size: 0.85em;
          font-weight: 500;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .search-item-meta {
          font-size: 0.75em;
          color: var(--secondary-text-color, #aaa);
        }
        .search-item-price {
          font-size: 0.85em;
          font-weight: 600;
          color: var(--primary-color, #03a9f4);
          flex-shrink: 0;
        }
        .add-btn {
          background: var(--primary-color, #03a9f4);
          border: none;
          border-radius: 50%;
          width: 28px;
          height: 28px;
          color: #fff;
          font-size: 1.1em;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .add-btn:disabled { opacity: 0.5; cursor: default; }
        .search-status {
          font-size: 0.8em;
          color: var(--secondary-text-color, #aaa);
          padding: 6px 4px;
        }
        .search-error { color: var(--error-color, #f44336); }
      </style>
    `;

    let body;
    if (this._loading) {
      body = `<div class="loading">Loading cart…</div>`;
    } else if (this._error) {
      body = `<div class="error">${this._error}</div>`;
    } else if (this._products.length === 0) {
      body = `<div class="empty">Cart is empty</div>`;
    } else {
      const items = this._products.map(p => {
        const cached = this._imageCache[p.id];
        const imgUrl = cached?.image;
        const amount = cached?.textualAmount || "";
        const meta = [p.brand, amount].filter(Boolean).join(" · ");
        const imgHtml = imgUrl
          ? `<img class="item-img" src="${imgUrl}" alt="" loading="lazy">`
          : `<div class="item-img-placeholder">🛒</div>`;
        const price = p.price ? `${p.price} Kč` : "";
        return `
          <div class="item">
            ${imgHtml}
            <div class="item-info">
              <div class="item-name" title="${p.name}">${p.name || `Product ${p.id}`}</div>
              ${meta ? `<div class="item-meta">${meta}</div>` : ""}
            </div>
            <div class="item-right">
              ${price ? `<div class="item-price">${price}</div>` : ""}
              <div class="item-qty">× ${p.quantity}</div>
              <button class="remove-btn" data-id="${p.cart_item_id}" title="Remove">✕</button>
            </div>
          </div>
        `;
      }).join("");

      body = `
        <div class="items">${items}</div>
        <div class="footer">
          <span class="total-label">Total (${this._totalItems} items)</span>
          <span class="total-price">${this._totalPrice} Kč</span>
        </div>
      `;
    }

    let searchResultsHtml = "";
    if (this._searching) {
      searchResultsHtml = `<div class="search-status">Searching…</div>`;
    } else if (this._searchError) {
      searchResultsHtml = `<div class="search-status search-error">${this._searchError}</div>`;
    } else if (this._searchResults.length > 0) {
      searchResultsHtml = `<div class="search-results">` + this._searchResults.map(p => {
        const cached = this._imageCache[p.id];
        const imgUrl = cached?.image;
        const amount = cached?.textualAmount || "";
        const meta = [p.brand, amount].filter(Boolean).join(" · ");
        const imgHtml = imgUrl
          ? `<img class="search-item-img" src="${imgUrl}" alt="" loading="lazy">`
          : `<div class="search-item-placeholder">🛒</div>`;
        const price = p.price ? `${p.price} Kč` : "";
        const adding = this._addingToCart[p.id];
        return `
          <div class="search-item">
            ${imgHtml}
            <div class="search-item-info">
              <div class="search-item-name" title="${p.name}">${p.name}</div>
              ${meta ? `<div class="search-item-meta">${meta}</div>` : ""}
            </div>
            ${price ? `<div class="search-item-price">${price}</div>` : ""}
            <button class="add-btn" data-product-id="${p.id}" title="Add to cart" ${adding ? "disabled" : ""}>${adding ? "…" : "+"}</button>
          </div>
        `;
      }).join("") + `</div>`;
    }

    this.shadowRoot.innerHTML = `
      ${style}
      <div class="card">
        <div class="header">
          <div class="header-left">
            <div>
              <div class="title">${title}</div>
              ${!this._loading && this._products.length > 0 ? `<div class="subtitle">${this._products.length} items</div>` : ""}
            </div>
          </div>
          <button class="refresh-btn" id="refresh">↻ Refresh</button>
        </div>
        <div class="search-section">
          <div class="search-row">
            <input class="search-input" id="search-input" type="text" placeholder="Search products…" value="${this._searchQuery}">
            <button class="search-btn" id="search-btn" ${this._searching ? "disabled" : ""}>Search</button>
          </div>
          ${searchResultsHtml}
        </div>
        ${body}
      </div>
    `;

    this.shadowRoot.getElementById("refresh")?.addEventListener("click", () => {
      this._loaded = false;
      this._fetchCart();
    });

    const searchInput = this.shadowRoot.getElementById("search-input");
    const searchBtn = this.shadowRoot.getElementById("search-btn");

    searchBtn?.addEventListener("click", () => {
      this._searchQuery = searchInput?.value || "";
      this._searchProducts(this._searchQuery);
    });

    searchInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        this._searchQuery = searchInput.value;
        this._searchProducts(this._searchQuery);
      }
    });

    searchInput?.addEventListener("input", (e) => {
      this._searchQuery = e.target.value;
      if (!this._searchQuery) {
        this._searchResults = [];
        this._searchError = null;
        this._render();
      }
    });

    this.shadowRoot.querySelectorAll(".add-btn").forEach(btn => {
      btn.addEventListener("click", () => this._addToCart(Number(btn.dataset.productId)));
    });

    this.shadowRoot.querySelectorAll(".remove-btn").forEach(btn => {
      btn.addEventListener("click", () => this._removeFromCart(btn.dataset.id));
    });
  }

  static getConfigElement() {
    return document.createElement("rohlikcz-cart-card-editor");
  }

  static getStubConfig() {
    return { config_entry_id: "", title: "Rohlik Cart" };
  }
}

customElements.define("rohlikcz-cart-card", RohlikczCartCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "rohlikcz-cart-card",
  name: "Rohlik Cart",
  description: "Displays your current Rohlik.cz shopping cart with product images and prices.",
});

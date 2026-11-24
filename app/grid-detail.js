/**
 * @fileoverview 検索絞り込み・一覧カード描画・詳細閲覧モーダル・アイテム削除のメソッド群
 */

Object.assign(ArchiveApp.prototype, {
  /**
   * 現在の検索欄の条件を確定済み「追い打ち検索」条件リストへ追加する
   * @this {ArchiveApp}
   * @returns {void}
   */
  addDrillDownFilter() {
    const target = document.getElementById("searchTarget").value;
    const matchType = document.getElementById("searchMatchType").value;
    const wordInput = document.getElementById("searchWord");
    const word = wordInput.value.trim();

    if (!word) {
      this.showToast("検索ワードを入力してから「追い打ち検索」を押してください");
      wordInput.focus();
      return;
    }

    this.searchFilters.push({ target, matchType, word });
    wordInput.value = "";

    this.renderActiveFilters();
    this.renderGrid();
    this.showToast("絞り込み条件を追加しました");
  },

  /**
   * 適用中の追い打ち検索条件チップを検索パネル上部に描画する
   * @this {ArchiveApp}
   * @returns {void}
   */
  renderActiveFilters() {
    const area = document.getElementById("activeFiltersArea");
    const container = document.getElementById("activeFilterChips");
    if (!area || !container) return;

    if (this.searchFilters.length === 0) {
      area.classList.add("hidden");
      container.innerHTML = "";
      return;
    }

    area.classList.remove("hidden");
    container.innerHTML = "";

    this.searchFilters.forEach((filter, index) => {
      const targetLabel = ArchiveConfig.TARGET_LABELS[filter.target] || filter.target;
      const matchLabel = ArchiveConfig.MATCH_TYPE_LABELS[filter.matchType] || filter.matchType;

      const chip = document.createElement("div");
      chip.className = "filter-chip";
      chip.innerHTML = `
        <span class="filter-chip-step">${index + 1}</span>
        <span class="filter-chip-meta">${this.escapeHtml(targetLabel)}（${this.escapeHtml(matchLabel)}）:</span>
        <span class="filter-chip-word">${this.escapeHtml(filter.word)}</span>
        <button type="button" class="filter-chip-remove" title="この条件を解除">×</button>
      `;

      chip.querySelector(".filter-chip-remove").addEventListener("click", () => {
        this.searchFilters.splice(index, 1);
        this.renderActiveFilters();
        this.renderGrid();
      });

      container.appendChild(chip);
    });
  },

  /**
   * 指定されたIDのアイテムを確認ダイアログ後に削除する
   * @this {ArchiveApp}
   * @param {string} id - 削除対象のアイテムID
   * @returns {Promise<boolean>} 削除を実行した場合 true、キャンセル時 false
   */
  async deleteItem(id) {
    const target = this.items.find((x) => x.id === id);
    if (!target) return false;

    const ok = await this.showConfirm({
      title: "データの削除",
      message: `「${target.title}」を削除してもよろしいですか？\nこの操作は取り消せません。`,
      confirmText: "削除する",
      isDanger: true
    });
    if (!ok) return false;

    this.items = this.items.filter((x) => x.id !== id);
    this.autoSave();
    await this.renderGrid();
    this.showToast("データを削除しました");
    return true;
  },

  /**
   * 検索条件によるフィルタリングを実行し、一覧グリッドカードを描画する
   * @this {ArchiveApp}
   * @returns {Promise<void>}
   */
  async renderGrid() {
    let searchable = this.buildSearchableItems(this.items);
    for (const filter of this.searchFilters) {
      searchable = Searcher.search(searchable, filter.word, filter.target, filter.matchType);
    }

    const target = document.getElementById("searchTarget").value;
    const matchType = document.getElementById("searchMatchType").value;
    const searchWord = document.getElementById("searchWord").value;
    searchable = Searcher.search(searchable, searchWord, target, matchType);

    // 検索結果のID集合から元のアイテム配列を抽出
    const matchedIds = new Set(searchable.map((x) => x.id));
    const filtered = this.items.filter((x) => matchedIds.has(x.id));

    const filterBadgeText =
      this.searchFilters.length > 0 ? `（追い打ち ${this.searchFilters.length}件適用中）` : "";
    document.getElementById("resultCount").textContent = `${filtered.length} / ${this.items.length} 件表示${filterBadgeText}`;

    const grid = document.getElementById("archiveGrid");
    grid.innerHTML = "";

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <p>表示するデータがありません。</p>
          <p style="font-size:0.85rem;margin-top:0.5rem;">右上の「＋ 新規登録」からデータを追加するか、検索条件を変更してください。</p>
        </div>
      `;
      return;
    }

    for (const item of filtered) {
      const card = document.createElement("article");
      card.className = "archive-card";

      const hasImages = Array.isArray(item.images) && item.images.length > 0;
      const thumbUrl = hasImages ? await this.storage.getImageUrl(item.images[0]) : null;
      const { urls, primaryUrl, primaryLabel } = this.normalizeItemUrls(item);

      const tagsHtml = (item.tags || [])
        .map((t) => `<span class="tag-badge" data-tag="${this.escapeHtml(t)}">#${this.escapeHtml(t)}</span>`)
        .join("");

      const linkDisplayText = primaryLabel || "リンク";
      const allUrlsTooltip = urls
        .map((u) => (u.label ? `[${u.label}] ${u.url}` : u.url))
        .join("\n");

      const linkHtml = primaryUrl
        ? `
          <div class="card-link-group">
            <button
              type="button"
              class="card-link-copy-btn"
              data-copy-url="${this.escapeHtml(primaryUrl)}"
              title="マークをクリックしてURLをコピー"
              aria-label="URLをコピー"
            >🔗</button>
            <a
              href="${this.escapeHtml(primaryUrl)}"
              target="_blank"
              rel="noopener noreferrer"
              class="card-link-text"
              title="${this.escapeHtml(primaryUrl)}"
            >${this.escapeHtml(linkDisplayText)}</a>
            ${
              urls.length > 1
                ? `<span class="card-link-extra-badge" title="${this.escapeHtml(allUrlsTooltip)}">+${urls.length - 1}</span>`
                : ""
            }
          </div>
        `
        : "";

      card.innerHTML = `
        <div class="card-thumb">
          ${
            thumbUrl
              ? `<img src="${thumbUrl}" alt="${this.escapeHtml(item.title)}" />`
              : `<span class="card-thumb-placeholder">${hasImages ? this.escapeHtml(item.images[0]) : "No Image"}</span>`
          }
          ${hasImages ? `<span class="img-count-badge">🖼 ${item.images.length}枚</span>` : ""}
        </div>
        <div class="card-body">
          ${item.series ? `<div class="card-series">${this.escapeHtml(item.series)}</div>` : ""}
          <h3 class="card-title">${this.escapeHtml(item.title)}</h3>
          ${item.author ? `<div class="card-author">作者: ${this.escapeHtml(item.author)}</div>` : ""}
          <div class="card-tags">${tagsHtml}</div>
          ${item.memo ? `<p class="card-memo">${this.escapeHtml(item.memo)}</p>` : ""}
        </div>
        <div class="card-footer">
          ${linkHtml}
          <div class="card-actions">
            <button type="button" class="btn btn-secondary btn-sm btn-edit">編集</button>
            <button type="button" class="btn btn-danger btn-sm btn-delete">削除</button>
          </div>
        </div>
      `;

      card.querySelector(".card-thumb").addEventListener("click", () => this.openDetailModal(item));
      card.querySelector(".card-title").addEventListener("click", () => this.openDetailModal(item));

      // リンクマーク押下でコピー
      const copyBtn = card.querySelector(".card-link-copy-btn");
      if (copyBtn) {
        copyBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.copyToClipboard(copyBtn.getAttribute("data-copy-url"));
        });
      }

      card.querySelectorAll(".tag-badge").forEach((badge) => {
        badge.addEventListener("click", () => {
          document.getElementById("searchTarget").value = "tags";
          document.getElementById("searchMatchType").value = "exact";
          document.getElementById("searchWord").value = badge.getAttribute("data-tag");
          this.renderGrid();
        });
      });

      card.querySelector(".btn-edit").addEventListener("click", () => this.openEditModal(item));
      card.querySelector(".btn-delete").addEventListener("click", () => this.deleteItem(item.id));

      grid.appendChild(card);
    }
  },

  /**
   * アイテムの詳細情報をモーダルで表示する
   * @this {ArchiveApp}
   * @param {ArchiveItem} item - 詳細表示対象のアイテム
   * @returns {Promise<void>}
   */
  async openDetailModal(item) {
    this.activeDetailId = item.id;
    document.getElementById("detailTitle").textContent = item.title;

    let galleryHtml = "";
    if (Array.isArray(item.images) && item.images.length > 0) {
      const itemsHtml = [];
      for (const fname of item.images) {
        const url = await this.storage.getImageUrl(fname);
        itemsHtml.push(`
          <div class="detail-gallery-item">
            ${url ? `<img src="${url}" alt="${this.escapeHtml(fname)}" />` : `<div style="padding:2rem;color:#94a3b8;">画像未読込</div>`}
            <div class="detail-gallery-caption">images/${this.escapeHtml(fname)}</div>
          </div>
        `);
      }
      galleryHtml = `<div class="detail-gallery">${itemsHtml.join("")}</div>`;
    }

    const tagsHtml = (item.tags || [])
      .map((t) => `<span class="tag-badge">#${this.escapeHtml(t)}</span>`)
      .join(" ");

    const { urls, primaryUrlIndex } = this.normalizeItemUrls(item);
    const urlsHtml =
      urls.length > 0
        ? `<div class="detail-url-list">
            ${urls
              .map(
                (entry, idx) => `
                <div class="detail-url-item">
                  ${idx === primaryUrlIndex ? `<span class="detail-url-primary-badge">★ 代表</span>` : ""}
                  ${entry.label ? `<span class="detail-url-label-badge">${this.escapeHtml(entry.label)}</span>` : ""}
                  <button
                    type="button"
                    class="card-link-copy-btn detail-copy-url-btn"
                    data-copy-url="${this.escapeHtml(entry.url)}"
                    title="マークをクリックしてURLをコピー"
                  >🔗</button>
                  <a href="${this.escapeHtml(entry.url)}" target="_blank" rel="noopener noreferrer" class="detail-url-text">${this.escapeHtml(entry.url)}</a>
                </div>
              `
              )
              .join("")}
          </div>`
        : "—";

    const detailBody = document.getElementById("detailBody");
    detailBody.innerHTML = `
      ${galleryHtml}
      <table class="detail-meta-table">
        <tr><th>シリーズ</th><td>${this.escapeHtml(item.series || "—")}</td></tr>
        <tr><th>作者</th><td>${this.escapeHtml(item.author || "—")}</td></tr>
        <tr><th>URL</th><td>${urlsHtml}</td></tr>
        <tr><th>タグ</th><td>${tagsHtml || "—"}</td></tr>
        <tr><th>登録画像ファイル</th><td>${(item.images || []).map((f) => this.escapeHtml(f)).join(", ") || "なし"}</td></tr>
      </table>
      <div>
        <h4 style="font-size:0.85rem;color:var(--text-muted);margin-bottom:0.4rem;">説明文兼メモ</h4>
        <div class="detail-memo-box">${this.escapeHtml(item.memo || "（メモなし）")}</div>
      </div>
    `;

    // 詳細モーダル内のコピーボタンイベント
    detailBody.querySelectorAll(".detail-copy-url-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.copyToClipboard(btn.getAttribute("data-copy-url"));
      });
    });

    this.openModal("detailModal");
  }
});
/**
 * @fileoverview データ登録・編集フォーム、URL/タグ/画像入力および既存画像ピッカーのメソッド群
 */

Object.assign(ArchiveApp.prototype, {
  /**
   * ラベル入力欄とURL入力欄の内容を現在編集中のURLリストへ追加する（初回追加時は代表インデックス 0）
   * @this {ArchiveApp}
   * @returns {void}
   */
  addUrlFromInput() {
    const labelInput = document.getElementById("urlLabelInput");
    const urlInput = document.getElementById("urlInput");
    const rawLabel = labelInput.value.trim();
    const rawUrl = urlInput.value.trim();

    if (!rawUrl) {
      if (rawLabel) {
        urlInput.focus();
      }
      return;
    }

    this.currentUrls.push({ label: rawLabel, url: rawUrl });
    if (this.currentUrls.length === 1) {
      this.currentPrimaryUrlIndex = 0;
    }
    labelInput.value = "";
    urlInput.value = "";
    this.renderUrlList();
  },

  /**
   * 登録済みURLリストを描画する（代表URL選択・ラベル編集・URL編集・削除に対応）
   * @this {ArchiveApp}
   * @returns {void}
   */
  renderUrlList() {
    const container = document.getElementById("urlItemList");
    container.innerHTML = "";

    if (this.currentPrimaryUrlIndex < 0 || this.currentPrimaryUrlIndex >= this.currentUrls.length) {
      this.currentPrimaryUrlIndex = 0;
    }

    this.currentUrls.forEach((entry, index) => {
      const isPrimary = index === this.currentPrimaryUrlIndex;

      const row = document.createElement("div");
      row.className = "url-item-row" + (isPrimary ? " is-primary" : "");
      row.innerHTML = `
        <button
          type="button"
          class="url-primary-btn ${isPrimary ? "active" : ""}"
          title="一覧カードのリンクに使用する代表URLに設定します"
        >
          ${isPrimary ? "★ 代表" : "☆ 代表にする"}
        </button>
        <input
          type="text"
          class="url-item-label-input"
          value="${this.escapeHtml(entry.label)}"
          placeholder="ラベル (任意)"
          autocomplete="off"
        />
        <input
          type="url"
          class="url-item-input"
          value="${this.escapeHtml(entry.url)}"
          placeholder="https://example.com"
          autocomplete="off"
        />
        <button type="button" class="url-remove-btn" title="このURLを削除">✕</button>
      `;

      // 代表URLの切り替え
      row.querySelector(".url-primary-btn").addEventListener("click", () => {
        this.currentPrimaryUrlIndex = index;
        this.renderUrlList();
      });

      // ラベルの直接編集
      row.querySelector(".url-item-label-input").addEventListener("input", (e) => {
        this.currentUrls[index].label = e.target.value;
      });

      // URL文字列の直接編集
      row.querySelector(".url-item-input").addEventListener("input", (e) => {
        this.currentUrls[index].url = e.target.value;
      });

      // URLの削除（削除後の代表インデックスを自動補正）
      row.querySelector(".url-remove-btn").addEventListener("click", () => {
        this.currentUrls.splice(index, 1);
        if (this.currentUrls.length === 0) {
          this.currentPrimaryUrlIndex = 0;
        } else if (index === this.currentPrimaryUrlIndex) {
          this.currentPrimaryUrlIndex = 0;
        } else if (index < this.currentPrimaryUrlIndex) {
          this.currentPrimaryUrlIndex -= 1;
        }
        this.renderUrlList();
      });

      container.appendChild(row);
    });
  },

  /**
   * 既存画像選択ピッカーモーダルを開き、参照先画像一覧を読み込む
   * @this {ArchiveApp}
   * @returns {Promise<void>}
   */
  async openExistingImagePicker() {
    this.selectedExistingSet.clear();
    const minInput = document.getElementById("existingImageMinNum");
    const maxInput = document.getElementById("existingImageMaxNum");
    if (minInput) minInput.value = "";
    if (maxInput) maxInput.value = "";

    const sourceLabel = document.getElementById("existingImageSourceLabel");
    if (sourceLabel) {
      sourceLabel.textContent = this.storage.isFolderConnected()
        ? `参照先: ${this.storage.currentFolderName}/images/`
        : "参照先: ブラウザ内ストレージ（未連携）";
    }

    this.availableExistingImages = await this.storage.listAvailableImages();
    this.updateExistingSelectedCount();
    await this.renderExistingImageGrid();
    this.openModal("existingImageModal");
  },

  /**
   * 既存画像ピッカーフッターの選択枚数表示を更新する
   * @this {ArchiveApp}
   * @returns {void}
   */
  updateExistingSelectedCount() {
    const countEl = document.getElementById("existingSelectedCount");
    if (countEl) {
      countEl.textContent = `${this.selectedExistingSet.size} 枚選択中`;
    }
  },

  /**
   * 既存画像選択ピッカー内のサムネイルグリッドを番号範囲フィルター付きで描画する
   * @this {ArchiveApp}
   * @returns {Promise<void>}
   */
  async renderExistingImageGrid() {
    const grid = document.getElementById("existingImageGrid");
    const minRaw = document.getElementById("existingImageMinNum")?.value.trim() ?? "";
    const maxRaw = document.getElementById("existingImageMaxNum")?.value.trim() ?? "";

    const minNum = minRaw !== "" ? parseInt(minRaw, 10) : null;
    const maxNum = maxRaw !== "" ? parseInt(maxRaw, 10) : null;
    const hasMin = minNum !== null && !Number.isNaN(minNum);
    const hasMax = maxNum !== null && !Number.isNaN(maxNum);

    grid.innerHTML = "";

    const filteredNames =
      hasMin || hasMax
        ? this.availableExistingImages.filter((name) => {
            const match = name.match(/^img(\d+)/i) || name.match(/(\d+)/);
            if (!match) return false;
            const num = parseInt(match[1], 10);
            if (hasMin && num < minNum) return false;
            if (hasMax && num > maxNum) return false;
            return true;
          })
        : this.availableExistingImages;

    if (filteredNames.length === 0) {
      grid.innerHTML = `
        <div class="existing-image-empty">
          指定された条件に一致する画像が見つかりません。<br />
          範囲指定を変更するか、先にドラッグ＆ドロップで画像を登録してください。
        </div>
      `;
      return;
    }

    for (const filename of filteredNames) {
      const url = await this.storage.getImageUrl(filename);
      const isSelected = this.selectedExistingSet.has(filename);
      const alreadyAttached = this.currentImages.includes(filename);

      const card = document.createElement("div");
      card.className = "existing-image-card" + (isSelected ? " is-selected" : "");
      card.innerHTML = `
        ${alreadyAttached ? `<span class="existing-image-in-use">追加済</span>` : ""}
        ${isSelected ? `<span class="existing-image-badge">✓ 選択</span>` : ""}
        ${
          url
            ? `<img src="${url}" alt="${this.escapeHtml(filename)}" />`
            : `<div style="height:120px;display:flex;align-items:center;justify-content:center;font-size:0.75rem;color:#94a3b8;">読込不可</div>`
        }
        <div class="existing-image-name" title="${this.escapeHtml(filename)}">${this.escapeHtml(filename)}</div>
      `;

      card.addEventListener("click", () => {
        if (this.selectedExistingSet.has(filename)) {
          this.selectedExistingSet.delete(filename);
          card.classList.remove("is-selected");
          const badge = card.querySelector(".existing-image-badge");
          if (badge) badge.remove();
        } else {
          this.selectedExistingSet.add(filename);
          card.classList.add("is-selected");
          const badge = document.createElement("span");
          badge.className = "existing-image-badge";
          badge.textContent = "✓ 選択";
          card.appendChild(badge);
        }
        this.updateExistingSelectedCount();
      });

      grid.appendChild(card);
    }
  },

  /**
   * ドロップまたは選択された画像ファイルを "img" + 連番 の名前でストレージへ保存し編集リストに追加する
   * @this {ArchiveApp}
   * @param {FileList|File[]} fileList - 入力された画像ファイル一覧
   * @returns {Promise<void>}
   */
  async handleImageFiles(fileList) {
    const imageFiles = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length === 0) {
      this.showToast("画像ファイルを選択してください");
      return;
    }

    const existing = await this.storage.listAvailableImages();
    for (const fname of existing) {
      const m = fname.match(/^img(\d+)/i);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n >= this.imageCounter) this.imageCounter = n + 1;
      }
    }

    for (const file of imageFiles) {
      const extMatch = file.name.match(/\.[a-zA-Z0-9]+$/);
      const ext = extMatch ? extMatch[0].toLowerCase() : ".png";
      const assignedFilename = `img${this.imageCounter}${ext}`;
      this.imageCounter++;

      await this.storage.saveImageFile(file, assignedFilename);
      this.currentImages.push(assignedFilename);
    }

    await this.renderImagePreviews();
    this.showToast(`${imageFiles.length}枚の画像を登録しました`);
  },

  /**
   * タグ入力欄のテキストを編集中のタグリストへ追加する
   * @this {ArchiveApp}
   * @returns {void}
   */
  addTagFromInput() {
    const input = document.getElementById("tagInput");
    const raw = input.value.replace(/,/g, "").trim();
    if (raw && !this.currentTags.includes(raw)) {
      this.currentTags.push(raw);
      this.renderTagChips();
    }
    input.value = "";
  },

  /**
   * 現在編集中のタグ一覧をチップUIとして描画する
   * @this {ArchiveApp}
   * @returns {void}
   */
  renderTagChips() {
    const container = document.getElementById("tagChips");
    container.innerHTML = "";
    this.currentTags.forEach((tag, index) => {
      const chip = document.createElement("span");
      chip.className = "tag-chip";
      chip.innerHTML = `${this.escapeHtml(tag)} <button type="button" aria-label="削除">×</button>`;
      chip.querySelector("button").addEventListener("click", () => {
        this.currentTags.splice(index, 1);
        this.renderTagChips();
      });
      container.appendChild(chip);
    });
  },

  /**
   * 現在編集中の画像一覧をサムネイルプレビューとして描画する
   * @this {ArchiveApp}
   * @returns {Promise<void>}
   */
  async renderImagePreviews() {
    const list = document.getElementById("imagePreviewList");
    list.innerHTML = "";

    for (let i = 0; i < this.currentImages.length; i++) {
      const filename = this.currentImages[i];
      const url = await this.storage.getImageUrl(filename);

      const itemEl = document.createElement("div");
      itemEl.className = "preview-item";
      itemEl.innerHTML = `
        ${url ? `<img src="${url}" alt="${this.escapeHtml(filename)}" />` : `<div style="height:90px;display:flex;align-items:center;justify-content:center;font-size:0.75rem;color:#94a3b8;">No Image</div>`}
        <span class="preview-filename" title="${this.escapeHtml(filename)}">${this.escapeHtml(filename)}</span>
        <button type="button" class="preview-remove" title="リストから外す">✕</button>
      `;

      itemEl.querySelector(".preview-remove").addEventListener("click", () => {
        this.currentImages.splice(i, 1);
        this.renderImagePreviews();
      });

      list.appendChild(itemEl);
    }
  },

  /**
   * 新規登録または既存データ編集用のモーダルを開く
   * @this {ArchiveApp}
   * @param {ArchiveItem|null} [item=null] - 編集対象アイテム（新規登録時は null）
   * @returns {Promise<void>}
   */
  async openEditModal(item = null) {
    const titleEl = document.getElementById("editModalTitle");
    if (item) {
      titleEl.textContent = "データの編集";
      document.getElementById("itemId").value = item.id;
      document.getElementById("itemTitle").value = item.title || "";
      document.getElementById("itemSeries").value = item.series || "";
      document.getElementById("itemAuthor").value = item.author || "";
      document.getElementById("urlLabelInput").value = "";
      document.getElementById("urlInput").value = "";
      document.getElementById("itemMemo").value = item.memo || "";

      const { urls, primaryUrlIndex } = this.normalizeItemUrls(item);
      this.currentUrls = urls.map((u) => ({ ...u }));
      this.currentPrimaryUrlIndex = primaryUrlIndex;
      this.currentTags = Array.isArray(item.tags) ? [...item.tags] : [];
      this.currentImages = Array.isArray(item.images) ? [...item.images] : [];
    } else {
      titleEl.textContent = "新規データの登録";
      document.getElementById("archiveForm").reset();
      document.getElementById("itemId").value = "";
      this.currentUrls = [];
      this.currentPrimaryUrlIndex = 0;
      this.currentTags = [];
      this.currentImages = [];
    }

    this.renderUrlList();
    this.renderTagChips();
    await this.renderImagePreviews();
    this.openModal("editModal");
  },

  /**
   * フォームの入力内容を検証・整形して新規追加または既存データの更新を行う
   * @this {ArchiveApp}
   * @returns {Promise<void>}
   */
  async saveFormItem() {
    this.addUrlFromInput();
    this.addTagFromInput();

    // 空文字のURL行を除外しつつ代表インデックスを保持
    const rawPrimaryEntry = this.currentUrls[this.currentPrimaryUrlIndex] || null;
    const cleanedUrls = this.currentUrls
      .map((entry) => ({
        label: String(entry.label || "").trim(),
        url: String(entry.url || "").trim()
      }))
      .filter((entry) => entry.url !== "");

    let nextPrimaryIndex = 0;
    if (rawPrimaryEntry && rawPrimaryEntry.url.trim() !== "") {
      const foundIdx = cleanedUrls.findIndex(
        (entry) =>
          entry.url === rawPrimaryEntry.url.trim() && entry.label === String(rawPrimaryEntry.label || "").trim()
      );
      if (foundIdx >= 0) nextPrimaryIndex = foundIdx;
    }

    const primaryUrl = cleanedUrls[nextPrimaryIndex]?.url || "";

    const id = document.getElementById("itemId").value;
    const itemData = {
      id: id || String(Date.now()),
      title: document.getElementById("itemTitle").value.trim(),
      series: document.getElementById("itemSeries").value.trim(),
      author: document.getElementById("itemAuthor").value.trim(),
      images: [...this.currentImages],
      urls: cleanedUrls,
      primaryUrlIndex: nextPrimaryIndex,
      url: primaryUrl,
      tags: [...this.currentTags],
      memo: document.getElementById("itemMemo").value.trim(),
      updatedAt: new Date().toISOString()
    };

    if (id) {
      const idx = this.items.findIndex((x) => x.id === id);
      if (idx !== -1) this.items[idx] = itemData;
      this.showToast("データを更新しました");
    } else {
      this.items.unshift(itemData);
      this.showToast("新規データを登録しました");
    }

    this.autoSave();
    this.closeModal("editModal");
    await this.renderGrid();
  }
});
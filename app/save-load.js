/**
 * @fileoverview データ正規化・オートセーブ・セーブスロット・JSONファイル入出力・リセットのメソッド群
 */

Object.assign(ArchiveApp.prototype, {
  /**
   * 単一URL（旧形式）・文字列配列（旧複数形式）・オブジェクト配列（ラベル付き新形式）を正規化する
   * @this {ArchiveApp}
   * @param {Partial<ArchiveItem>} item - 正規化対象のアイテムオブジェクト
   * @returns {{urls: UrlEntry[], primaryUrlIndex: number, primaryUrl: string, primaryLabel: string}} 正規化済みURL情報
   */
  normalizeItemUrls(item) {
    let urls = [];
    if (Array.isArray(item.urls)) {
      urls = item.urls
        .map((entry) => {
          if (typeof entry === "string") {
            return { label: "", url: entry.trim() };
          }
          if (entry && typeof entry === "object") {
            return {
              label: typeof entry.label === "string" ? entry.label.trim() : "",
              url: typeof entry.url === "string" ? entry.url.trim() : ""
            };
          }
          return { label: "", url: "" };
        })
        .filter((entry) => entry.url !== "");
    } else if (typeof item.url === "string" && item.url.trim() !== "") {
      urls = [{ label: "", url: item.url.trim() }];
    }

    let primaryUrlIndex =
      typeof item.primaryUrlIndex === "number" && Number.isInteger(item.primaryUrlIndex)
        ? item.primaryUrlIndex
        : 0;

    if (primaryUrlIndex < 0 || primaryUrlIndex >= urls.length) {
      primaryUrlIndex = 0;
    }

    const primaryEntry = urls[primaryUrlIndex] || { label: "", url: "" };

    return {
      urls,
      primaryUrlIndex,
      primaryUrl: primaryEntry.url,
      primaryLabel: primaryEntry.label
    };
  },

  /**
   * 全アイテムのURL構造を最新形式へ正規化する
   * @this {ArchiveApp}
   * @param {Partial<ArchiveItem>[]} items - アイテム配列
   * @returns {ArchiveItem[]} 正規化済みアイテム配列
   */
  normalizeAllItems(items) {
    if (!Array.isArray(items)) return [];
    return items.map((item) => {
      const { urls, primaryUrlIndex, primaryUrl } = this.normalizeItemUrls(item);
      return {
        ...item,
        urls,
        primaryUrlIndex,
        url: primaryUrl
      };
    });
  },

  /**
   * 検索エンジン用に複数URLおよびラベルを結合した検索対象オブジェクト配列を生成する
   * @this {ArchiveApp}
   * @param {ArchiveItem[]} items - 元のアイテム配列
   * @returns {ArchiveItem[]} 検索用に url フィールドを拡張したアイテム配列
   */
  buildSearchableItems(items) {
    return items.map((item) => {
      const { urls } = this.normalizeItemUrls(item);
      const combinedUrlSearchText = urls
        .map((u) => [u.label, u.url].filter(Boolean).join(" "))
        .join(" ");
      return {
        ...item,
        url: combinedUrlSearchText
      };
    });
  },

  /**
   * 既存データ内の "img数字" の最大値を確認し、連番カウンターが重複しないよう同期する
   * @this {ArchiveApp}
   * @returns {void}
   */
  syncImageCounterWithData() {
    let maxNum = this.imageCounter - 1;
    for (const item of this.items) {
      if (!Array.isArray(item.images)) continue;
      for (const fname of item.images) {
        const match = fname.match(/^img(\d+)/i);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) maxNum = num;
        }
      }
    }
    this.imageCounter = maxNum + 1;
  },

  /**
   * ヘッダーのセーブデータタイトル入力欄の表示を現在の状態と同期する
   * @this {ArchiveApp}
   * @returns {void}
   */
  syncArchiveTitleUI() {
    const titleInput = document.getElementById("archiveTitleInput");
    if (titleInput) {
      titleInput.value = this.archiveTitle || "";
    }
  },

  /**
   * ヘッダーの保存先ステータスバッジの表示を更新する
   * @this {ArchiveApp}
   * @returns {void}
   */
  updateFolderStatusUI() {
    const badge = document.getElementById("folderStatusBadge");
    if (this.storage.isFolderConnected()) {
      badge.textContent = `連携中: ${this.storage.currentFolderName}/`;
      badge.className = "status-badge status-folder";
    } else {
      badge.textContent = "保存先: ブラウザ内ストレージ";
      badge.className = "status-badge status-virtual";
    }
  },

  /**
   * 作業中のデータを localStorage へ自動保存する
   * @this {ArchiveApp}
   * @returns {void}
   */
  autoSave() {
    const payload = this.createSavePayload();
    localStorage.setItem(ArchiveConfig.SAVE_CONFIG.storageKeyAutoSave, JSON.stringify(payload));
  },

  /**
   * localStorage から前回作業中のオートセーブデータを復元する
   * @this {ArchiveApp}
   * @returns {Promise<void>}
   */
  async loadAutoSave() {
    const raw = localStorage.getItem(ArchiveConfig.SAVE_CONFIG.storageKeyAutoSave);
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      this.archiveTitle = typeof data.title === "string" ? data.title : "";
      this.items = this.normalizeAllItems(data.items);
      this.imageCounter = typeof data.imageCounter === "number" ? data.imageCounter : 1;
      if (data.linkedFolder) {
        await this.storage.restoreLinkedFolder(data.linkedFolder, false);
      }
    } catch (e) {
      console.error("オートセーブデータの読み込みに失敗:", e);
    }
  },

  /**
   * 現在のアプリケーション状態から保存用ペイロードオブジェクトを生成する
   * @this {ArchiveApp}
   * @returns {SavePayload} 保存用ペイロード
   */
  createSavePayload() {
    return {
      version: 1,
      title: this.archiveTitle.trim(),
      savedAt: new Date().toLocaleString("ja-JP"),
      imageCounter: this.imageCounter,
      linkedFolder: this.storage.getLinkedFolderMeta(),
      items: JSON.parse(JSON.stringify(this.items))
    };
  },

  /**
   * セーブデータペイロードを現在のアプリケーション状態へ適用する
   * @this {ArchiveApp}
   * @param {SavePayload} payload - 適用するセーブデータ
   * @param {boolean} [promptRelinkIfNeeded=true] - 連携フォルダ再指定モーダルを表示するかどうか
   * @returns {Promise<void>}
   * @throws {Error} セーブデータ形式が不正な場合
   */
  async applySavePayload(payload, promptRelinkIfNeeded = true) {
    if (!payload || !Array.isArray(payload.items)) {
      throw new Error("不正なセーブデータ形式です。");
    }

    this.archiveTitle = typeof payload.title === "string" ? payload.title : "";
    this.syncArchiveTitleUI();

    this.items = this.normalizeAllItems(payload.items);
    this.imageCounter = typeof payload.imageCounter === "number" ? payload.imageCounter : 1;
    this.syncImageCounterWithData();

    const restoreResult = await this.storage.restoreLinkedFolder(payload.linkedFolder, false);
    this.updateFolderStatusUI();
    this.autoSave();

    if (restoreResult.status === "needs_relink" && promptRelinkIfNeeded) {
      this.openRelinkFolderModal(restoreResult.folderName);
    }
  },

  /**
   * 連携フォルダ再指定モーダルを開く
   * @this {ArchiveApp}
   * @param {string} folderName - 記録されていた連携フォルダ名
   * @returns {void}
   */
  openRelinkFolderModal(folderName) {
    const nameEl = document.getElementById("relinkTargetFolderName");
    if (nameEl) {
      nameEl.textContent = folderName || "指定フォルダ";
    }
    this.openModal("relinkFolderModal");
  },

  /**
   * 今開いている作業データ（一覧・タイトル・検索条件・連携接続・ブラウザ内画像）を初期状態へリセットする
   * @this {ArchiveApp}
   * @returns {Promise<void>}
   */
  async resetCurrentData() {
    const ok = await this.showConfirm({
      title: "今開いているデータを空にする",
      message:
        "現在開いている一覧データ・タイトル・検索条件・連携フォルダの接続・ブラウザ内画像ストレージをすべて消去して初期状態に戻します。\n\n※SLOT 1〜10 のセーブデータや、PC上の連携フォルダ内の実ファイルは削除されません。",
      confirmText: "空にする",
      isDanger: true
    });
    if (!ok) return;

    this.storage.disconnectFolder();
    await this.storage.clearBrowserImages();

    this.archiveTitle = "";
    this.items = [];
    this.imageCounter = 1;
    this.searchFilters = [];
    this.currentUrls = [];
    this.currentPrimaryUrlIndex = 0;
    this.currentTags = [];
    this.currentImages = [];
    this.activeDetailId = null;

    document.getElementById("searchTarget").value = "all";
    document.getElementById("searchMatchType").value = "partial";
    document.getElementById("searchWord").value = "";

    this.syncArchiveTitleUI();
    this.updateFolderStatusUI();
    this.renderActiveFilters();
    this.autoSave();

    await this.renderGrid();
    this.closeModal("saveLoadModal");
    this.showToast("今開いているデータを空にしました");
  },

  /**
   * localStorage から全セーブスロットのデータを取得する
   * @this {ArchiveApp}
   * @returns {Object.<string, SavePayload>} スロットキーとセーブデータのマップ
   */
  getSaveSlots() {
    try {
      return JSON.parse(localStorage.getItem(ArchiveConfig.SAVE_CONFIG.storageKeySlots)) || {};
    } catch {
      return {};
    }
  },

  /**
   * セーブスロット全体を localStorage へ保存する
   * @this {ArchiveApp}
   * @param {Object.<string, SavePayload>} slots - 保存するスロットマップ
   * @returns {void}
   */
  saveSlotsToStorage(slots) {
    localStorage.setItem(ArchiveConfig.SAVE_CONFIG.storageKeySlots, JSON.stringify(slots));
  },

  /**
   * セーブ/ロードモーダル内のスロット一覧カードを描画する
   * @this {ArchiveApp}
   * @returns {void}
   */
  renderSaveSlots() {
    const slots = this.getSaveSlots();
    const container = document.getElementById("saveSlotList");
    container.innerHTML = "";

    const totalSlots = ArchiveConfig.SAVE_CONFIG.slotCount;

    for (let slotNum = 1; slotNum <= totalSlots; slotNum++) {
      const slotKey = `slot${slotNum}`;
      const data = slots[slotKey];

      const folderLabel = data
        ? data.linkedFolder
          ? `フォルダ: ${this.escapeHtml(data.linkedFolder.folderName)}`
          : "フォルダ: ブラウザ内ストレージ"
        : "";

      const titleDisplay = data
        ? data.title
          ? `<span class="slot-title-text">${this.escapeHtml(data.title)}</span>`
          : `<span class="slot-title-text slot-title-empty">（無題のデータ）</span>`
        : `<span class="slot-title-text slot-title-empty">NO DATA（空きスロット）</span>`;

      const card = document.createElement("div");
      card.className = "save-slot-card";
      card.innerHTML = `
        <div class="slot-info">
          <div class="slot-header-line">
            <span class="slot-number-badge">SLOT ${slotNum}</span>
            ${titleDisplay}
          </div>
          <div class="slot-meta">
            ${
              data
                ? `保存日時: ${data.savedAt} ／ 登録数: ${data.items.length}件 ／ ${folderLabel}`
                : "データは保存されていません"
            }
          </div>
        </div>
        <div class="slot-actions">
          <button type="button" class="btn btn-primary btn-sm btn-slot-save">セーブ</button>
          <button type="button" class="btn btn-secondary btn-sm btn-slot-load" ${!data ? "disabled" : ""}>ロード</button>
          <button type="button" class="btn btn-danger btn-sm btn-slot-clear" ${!data ? "disabled" : ""}>クリア</button>
        </div>
      `;

      // セーブ実行
      card.querySelector(".btn-slot-save").addEventListener("click", async () => {
        if (data) {
          const ok = await this.showConfirm({
            title: `SLOT ${slotNum} への上書きセーブ`,
            message: `SLOT ${slotNum}${data.title ? `（${data.title}）` : ""} にはすでにデータが保存されています。\n現在の内容で上書きセーブしますか？`,
            confirmText: "上書きセーブ",
            isDanger: false
          });
          if (!ok) return;
        }
        const currentSlots = this.getSaveSlots();
        currentSlots[slotKey] = this.createSavePayload();
        this.saveSlotsToStorage(currentSlots);
        this.renderSaveSlots();
        this.showToast(`SLOT ${slotNum} にセーブしました`);
      });

      // ロード・クリア実行
      if (data) {
        card.querySelector(".btn-slot-load").addEventListener("click", async () => {
          const ok = await this.showConfirm({
            title: `SLOT ${slotNum} のロード`,
            message: `SLOT ${slotNum}${data.title ? `（${data.title}）` : ""} のデータをロードしますか？\n現在開いている未セーブの状態は上書きされます。`,
            confirmText: "ロードする",
            isDanger: false
          });
          if (!ok) return;

          this.closeModal("saveLoadModal");
          await this.applySavePayload(data, true);
          await this.renderGrid();
          this.showToast(`SLOT ${slotNum} からロードしました`);
        });

        card.querySelector(".btn-slot-clear").addEventListener("click", async () => {
          const ok = await this.showConfirm({
            title: `SLOT ${slotNum} のクリア`,
            message: `SLOT ${slotNum}${data.title ? `（${data.title}）` : ""} のセーブデータを削除し、空きスロットに戻しますか？`,
            confirmText: "クリアする",
            isDanger: true
          });
          if (!ok) return;

          const currentSlots = this.getSaveSlots();
          delete currentSlots[slotKey];
          this.saveSlotsToStorage(currentSlots);
          this.renderSaveSlots();
          this.showToast(`SLOT ${slotNum} をクリアしました`);
        });
      }

      container.appendChild(card);
    }
  },

  /**
   * 現在のセーブデータを「archive_<タイトル>_<YYYYMMDD>_<HHMM>.json」形式で書き出す
   * @this {ArchiveApp}
   * @returns {Promise<void>}
   */
  async exportJsonFile() {
    const payload = this.createSavePayload();
    const jsonStr = JSON.stringify(payload, null, 2);

    const now = new Date();
    const yyyy = String(now.getFullYear());
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const hh = String(now.getHours()).padStart(2, "0");
    const min = String(now.getMinutes()).padStart(2, "0");

    const dateStr = `${yyyy}${mm}${dd}`;
    const timeStr = `${hh}${min}`;
    const safeTitle = payload.title
      ? payload.title.replace(/[\\/:*?"<>|]/g, "_")
      : "save";
    const exportFilename = `archive_${safeTitle}_${dateStr}_${timeStr}.json`;

    if (this.storage.isFolderConnected()) {
      try {
        await this.storage.writeFolderJsonFile(exportFilename, jsonStr);
        this.showToast(`連携フォルダ直下に「${exportFilename}」を保存しました`);
        return;
      } catch (e) {
        console.warn("連携フォルダへのJSON書き出しに失敗したため、通常ダウンロードに切り替えます:", e);
      }
    }

    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = exportFilename;
    a.click();
    URL.revokeObjectURL(url);
    this.showToast(`「${exportFilename}」をダウンロードしました`);
  },

  /**
   * 選択されたJSONファイルからセーブデータを読み込んで復元する
   * @this {ArchiveApp}
   * @param {File} file - 読み込むJSONファイル
   * @returns {Promise<void>}
   */
  async importJsonFile(file) {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      this.closeModal("saveLoadModal");
      await this.applySavePayload(parsed, true);
      await this.renderGrid();
      this.renderSaveSlots();
      this.showToast(`「${file.name}」からロードしました`);
    } catch (err) {
      await this.showNotice("ファイルの読み込みエラー", "ファイルの読み込みに失敗しました:\n" + err.message);
    }
  }
});
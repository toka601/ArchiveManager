/**
 * 画像ストレージ管理クラス
 * - フォルダ連携中: 指定フォルダ内の "images/" のみで画像を管理（ブラウザ内ストレージへは複製しない）
 * - 未連携 / フォールバック時: IndexedDB の "images" ストアで画像を管理
 */
class ImageStorageManager {
  constructor() {
    this.rootDirHandle = null;
    this.imagesDirHandle = null;
    this.currentHandleId = null;
    this.currentFolderName = null;
    this.db = null;
    this.urlCache = new Map();
  }

  async initDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("ArchiveImageDB", 2);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("images")) {
          db.createObjectStore("images", { keyPath: "filename" });
        }
        if (!db.objectStoreNames.contains("handles")) {
          db.createObjectStore("handles", { keyPath: "id" });
        }
      };
      request.onsuccess = (e) => {
        this.db = e.target.result;
        resolve();
      };
      request.onerror = (e) => reject(e);
    });
  }

  // フォルダハンドルをIndexedDBに保存し、識別IDを返す
  async saveDirectoryHandle(dirHandle) {
    if (!this.db) return "dir_" + Date.now();

    const allRecords = await new Promise((resolve) => {
      const tx = this.db.transaction("handles", "readonly");
      const store = tx.objectStore("handles");
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });

    for (const rec of allRecords) {
      if (rec.handle && (await rec.handle.isSameEntry(dirHandle))) {
        return rec.id;
      }
    }

    const newId = "dir_" + Date.now();
    await new Promise((resolve, reject) => {
      const tx = this.db.transaction("handles", "readwrite");
      const store = tx.objectStore("handles");
      store.put({ id: newId, name: dirHandle.name, handle: dirHandle });
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e);
    });
    return newId;
  }

  // ユーザーがPC上のフォルダを選択し、その中の images/ フォルダを準備
  async connectLocalFolder() {
    if (!window.showDirectoryPicker) {
      throw new Error(
        "お使いのブラウザまたは環境（file://等）ではフォルダ直接選択がサポートされていません。ローカルサーバー経由（http://localhost）で開くか、ブラウザ内ストレージをご利用ください。"
      );
    }
    const dirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
    const imagesHandle = await dirHandle.getDirectoryHandle("images", { create: true });
    const handleId = await this.saveDirectoryHandle(dirHandle);

    this.rootDirHandle = dirHandle;
    this.imagesDirHandle = imagesHandle;
    this.currentHandleId = handleId;
    this.currentFolderName = dirHandle.name;
    this.clearUrlCache();

    return dirHandle.name;
  }

  // フォルダ連携を解除し、ブラウザ内ストレージモードへ切り替える
  disconnectFolder() {
    this.rootDirHandle = null;
    this.imagesDirHandle = null;
    this.currentHandleId = null;
    this.currentFolderName = null;
    this.clearUrlCache();
  }

  // セーブデータ記録用のフォルダ情報を取得
  getLinkedFolderMeta() {
    if (!this.isFolderConnected()) return null;
    return {
      handleId: this.currentHandleId,
      folderName: this.currentFolderName
    };
  }

  /**
   * セーブデータから連携フォルダを復元する
   * @returns {Promise<{status: "none"|"connected"|"needs_relink", folderName?: string}>}
   */
  async restoreLinkedFolder(linkedFolderMeta, allowPrompt = false) {
    if (!linkedFolderMeta || !linkedFolderMeta.handleId) {
      this.disconnectFolder();
      return { status: "none" };
    }

    const folderName = linkedFolderMeta.folderName || "指定フォルダ";

    // すでに同じフォルダと連携済みならそのまま維持
    if (this.isFolderConnected() && this.currentHandleId === linkedFolderMeta.handleId) {
      return { status: "connected", folderName: this.currentFolderName };
    }

    if (!this.db) {
      this.disconnectFolder();
      return { status: "needs_relink", folderName };
    }

    const record = await new Promise((resolve) => {
      const tx = this.db.transaction("handles", "readonly");
      const store = tx.objectStore("handles");
      const req = store.get(linkedFolderMeta.handleId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });

    if (!record || !record.handle) {
      this.disconnectFolder();
      return { status: "needs_relink", folderName };
    }

    const dirHandle = record.handle;

    try {
      let perm = await dirHandle.queryPermission({ mode: "readwrite" });
      if (perm !== "granted") {
        if (allowPrompt) {
          perm = await dirHandle.requestPermission({ mode: "readwrite" });
        }
        if (perm !== "granted") {
          this.disconnectFolder();
          return { status: "needs_relink", folderName };
        }
      }

      for await (const _ of dirHandle.values()) {
        break;
      }
      const imagesHandle = await dirHandle.getDirectoryHandle("images", { create: true });

      this.rootDirHandle = dirHandle;
      this.imagesDirHandle = imagesHandle;
      this.currentHandleId = linkedFolderMeta.handleId;
      this.currentFolderName = dirHandle.name;
      this.clearUrlCache();

      return { status: "connected", folderName: dirHandle.name };
    } catch (e) {
      console.warn("連携フォルダの自動復元に失敗（再指定が必要）:", e);
      this.disconnectFolder();
      return { status: "needs_relink", folderName };
    }
  }

  isFolderConnected() {
    return Boolean(this.imagesDirHandle);
  }

  clearUrlCache() {
    for (const url of this.urlCache.values()) {
      URL.revokeObjectURL(url);
    }
    this.urlCache.clear();
  }

  // 画像を保存（連携フォルダがある場合は連携先のみに保存し、ブラウザ内ストレージには複製しない）
  async saveImageFile(file, filename) {
    if (this.imagesDirHandle) {
      const fileHandle = await this.imagesDirHandle.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(file);
      await writable.close();
    } else if (this.db) {
      await new Promise((resolve, reject) => {
        const tx = this.db.transaction("images", "readwrite");
        const store = tx.objectStore("images");
        store.put({ filename, blob: file });
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e);
      });
    }

    if (this.urlCache.has(filename)) {
      URL.revokeObjectURL(this.urlCache.get(filename));
    }
    const objectUrl = URL.createObjectURL(file);
    this.urlCache.set(filename, objectUrl);

    return filename;
  }

  // 連携フォルダの images/ 内、またはブラウザ内ストレージに存在する画像ファイル名一覧を取得
  async listAvailableImages() {
    const filenames = [];
    const imageExtRegex = /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i;

    if (this.imagesDirHandle) {
      try {
        for await (const [name, handle] of this.imagesDirHandle.entries()) {
          if (handle.kind === "file" && imageExtRegex.test(name)) {
            filenames.push(name);
          }
        }
      } catch (e) {
        console.warn("imagesフォルダの一覧取得に失敗:", e);
      }
    } else if (this.db) {
      const records = await new Promise((resolve) => {
        const tx = this.db.transaction("images", "readonly");
        const store = tx.objectStore("images");
        const req = store.getAllKeys();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });
      for (const key of records) {
        if (typeof key === "string") {
          filenames.push(key);
        }
      }
    }

    // img1, img2, ..., img10 の自然順でソート
    filenames.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
    return filenames;
  }

  // ファイル名（"img1.png" など）から表示用URLを取得
  async getImageUrl(filename) {
    if (this.urlCache.has(filename)) {
      return this.urlCache.get(filename);
    }

    if (this.imagesDirHandle) {
      try {
        const fileHandle = await this.imagesDirHandle.getFileHandle(filename);
        const file = await fileHandle.getFile();
        const url = URL.createObjectURL(file);
        this.urlCache.set(filename, url);
        return url;
      } catch (e) {
        console.warn(`連携フォルダ内の images/${filename} が見つかりません:`, e);
        return null;
      }
    }

    if (this.db) {
      const record = await new Promise((resolve) => {
        const tx = this.db.transaction("images", "readonly");
        const store = tx.objectStore("images");
        const req = store.get(filename);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      });

      if (record && record.blob) {
        const url = URL.createObjectURL(record.blob);
        this.urlCache.set(filename, url);
        return url;
      }
    }

    return null;
  }

  // 連携フォルダ直下（imagesと同格の場所）にエクスポート用JSONファイルを書き出す
  async writeFolderJsonFile(filename, jsonString) {
    if (!this.rootDirHandle) return false;
    const fileHandle = await this.rootDirHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(jsonString);
    await writable.close();
    return true;
  }
}

/**
 * アーカイブアプリケーション本体
 */
class ArchiveApp {
  // ▼ セーブ設定（後々スロット数を増やす場合は slotCount を変更する）
  static SAVE_CONFIG = {
    slotCount: 10,
    storageKeyAutoSave: "archive_app_autosave_v1",
    storageKeySlots: "archive_app_save_slots_v1"
  };

  static TARGET_LABELS = {
    all: "すべて",
    title: "タイトル",
    series: "シリーズ",
    author: "作者",
    tags: "タグ",
    memo: "説明文兼メモ",
    url: "URL"
  };

  static MATCH_TYPE_LABELS = {
    partial: "部分一致",
    exact: "完全一致",
    prefix: "前方一致",
    suffix: "後方一致",
    regex: "正規表現"
  };

  constructor() {
    this.archiveTitle = ""; // セーブデータに対するタイトル
    this.items = [];
    this.imageCounter = 1; // "img" + 数字 の連番カウンター（単調増加）
    this.storage = new ImageStorageManager();

    // 追い打ち検索の確定済みフィルター一覧
    this.searchFilters = []; // [{ target, matchType, word }, ...]

    // フォーム編集用の一時状態
    this.currentTags = [];
    this.currentImages = [];
    this.activeDetailId = null;

    // 既存画像選択ピッカー用の一時状態
    this.availableExistingImages = [];
    this.selectedExistingSet = new Set();
  }

  async init() {
    await this.storage.initDB();
    await this.loadAutoSave();
    this.bindEvents();

    // ビジュアル検索をアーカイブサイトに接続
    VisualSearch.init(
      document.getElementById("vs-opener"),
      document.getElementById("searchWord"),
      document.body
    );

    this.syncImageCounterWithData();
    this.syncArchiveTitleUI();
    this.updateFolderStatusUI();
    this.renderActiveFilters();
    await this.renderGrid();
  }

  // 既存データ内の "img数字" の最大値を確認し、カウンターが重複しないよう保証
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
  }

  // ヘッダーのセーブデータタイトル入力欄を同期
  syncArchiveTitleUI() {
    const titleInput = document.getElementById("archiveTitleInput");
    if (titleInput) {
      titleInput.value = this.archiveTitle || "";
    }
  }

  // ヘッダーの保存先バッジ表示を更新
  updateFolderStatusUI() {
    const badge = document.getElementById("folderStatusBadge");
    if (this.storage.isFolderConnected()) {
      badge.textContent = `連携中: ${this.storage.currentFolderName}/`;
      badge.className = "status-badge status-folder";
    } else {
      badge.textContent = "保存先: ブラウザ内ストレージ";
      badge.className = "status-badge status-virtual";
    }
  }

  // 作業中データの自動保存（リロード対策）
  autoSave() {
    const payload = this.createSavePayload();
    localStorage.setItem(ArchiveApp.SAVE_CONFIG.storageKeyAutoSave, JSON.stringify(payload));
  }

  async loadAutoSave() {
    const raw = localStorage.getItem(ArchiveApp.SAVE_CONFIG.storageKeyAutoSave);
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      this.archiveTitle = typeof data.title === "string" ? data.title : "";
      this.items = Array.isArray(data.items) ? data.items : [];
      this.imageCounter = typeof data.imageCounter === "number" ? data.imageCounter : 1;
      if (data.linkedFolder) {
        await this.storage.restoreLinkedFolder(data.linkedFolder, false);
      }
    } catch (e) {
      console.error("オートセーブデータの読み込みに失敗:", e);
    }
  }

  createSavePayload() {
    return {
      version: 1,
      title: this.archiveTitle.trim(),
      savedAt: new Date().toLocaleString("ja-JP"),
      imageCounter: this.imageCounter,
      linkedFolder: this.storage.getLinkedFolderMeta(),
      items: JSON.parse(JSON.stringify(this.items))
    };
  }

  async applySavePayload(payload, promptRelinkIfNeeded = true) {
    if (!payload || !Array.isArray(payload.items)) {
      throw new Error("不正なセーブデータ形式です。");
    }

    this.archiveTitle = typeof payload.title === "string" ? payload.title : "";
    this.syncArchiveTitleUI();

    this.items = payload.items;
    this.imageCounter = typeof payload.imageCounter === "number" ? payload.imageCounter : 1;
    this.syncImageCounterWithData();

    // セーブデータに記録されたフォルダ連携アクセスを復元
    const restoreResult = await this.storage.restoreLinkedFolder(payload.linkedFolder, false);
    this.updateFolderStatusUI();
    this.autoSave();

    // 自動復元できなかった場合は、ユーザー操作でフォルダを選択し直せるモーダルを表示
    if (restoreResult.status === "needs_relink" && promptRelinkIfNeeded) {
      this.openRelinkFolderModal(restoreResult.folderName);
    }
  }

  // 連携フォルダ再指定モーダルを開く
  openRelinkFolderModal(folderName) {
    const nameEl = document.getElementById("relinkTargetFolderName");
    if (nameEl) {
      nameEl.textContent = folderName || "指定フォルダ";
    }
    this.openModal("relinkFolderModal");
  }

  // イベント登録
  bindEvents() {
    // ヘッダーのセーブデータタイトル入力
    const archiveTitleInput = document.getElementById("archiveTitleInput");
    if (archiveTitleInput) {
      archiveTitleInput.addEventListener("input", (e) => {
        this.archiveTitle = e.target.value;
        this.autoSave();
      });
    }

    // 検索（リアルタイム絞り込み）
    const triggerSearch = () => this.renderGrid();
    document.getElementById("searchTarget").addEventListener("change", triggerSearch);
    document.getElementById("searchMatchType").addEventListener("change", triggerSearch);
    document.getElementById("searchWord").addEventListener("input", triggerSearch);
    document.getElementById("clearSearchBtn").addEventListener("click", () => {
      document.getElementById("searchWord").value = "";
      triggerSearch();
    });

    // 追い打ち検索ボタン
    document.getElementById("drillDownSearchBtn").addEventListener("click", () => {
      this.addDrillDownFilter();
    });

    // 追い打ち検索の「すべて解除」ボタン
    document.getElementById("clearAllFiltersBtn").addEventListener("click", () => {
      this.searchFilters = [];
      this.renderActiveFilters();
      this.renderGrid();
      this.showToast("追い打ち検索の条件をすべて解除しました");
    });

    // 連携フォルダボタン
    document.getElementById("selectFolderBtn").addEventListener("click", async () => {
      try {
        const folderName = await this.storage.connectLocalFolder();
        this.updateFolderStatusUI();
        this.autoSave();
        this.showToast(`「${folderName}/」を連携フォルダに設定しました`);
        await this.renderGrid();
      } catch (err) {
        if (err.name === "AbortError") return;
        alert(err.message);
      }
    });

    // 連携フォルダ再指定モーダル内のボタン
    document.getElementById("relinkSelectFolderBtn").addEventListener("click", async () => {
      try {
        const folderName = await this.storage.connectLocalFolder();
        this.updateFolderStatusUI();
        this.autoSave();
        this.closeModal("relinkFolderModal");
        this.showToast(`「${folderName}/」と再連携しました`);
        await this.renderGrid();
      } catch (err) {
        if (err.name === "AbortError") return;
        alert(err.message);
      }
    });

    document.getElementById("relinkUseBrowserStorageBtn").addEventListener("click", async () => {
      this.storage.disconnectFolder();
      this.updateFolderStatusUI();
      this.autoSave();
      this.closeModal("relinkFolderModal");
      this.showToast("ブラウザ内ストレージを使用します");
      await this.renderGrid();
    });

    // 新規登録モーダルを開く
    document.getElementById("openAddModalBtn").addEventListener("click", () => {
      this.openEditModal();
    });

    // セーブ/ロードモーダルを開く
    document.getElementById("openSaveLoadBtn").addEventListener("click", () => {
      this.renderSaveSlots();
      this.openModal("saveLoadModal");
    });

    // モーダル閉じる共通処理
    document.querySelectorAll("[data-close]").forEach((el) => {
      el.addEventListener("click", () => {
        this.closeModal(el.getAttribute("data-close"));
      });
    });

    // タグ入力（Enter または カンマ）
    const tagInput = document.getElementById("tagInput");
    tagInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        this.addTagFromInput();
      }
    });
    tagInput.addEventListener("blur", () => this.addTagFromInput());

    // 画像ドラッグ＆ドロップ & ファイル選択
    const dropZone = document.getElementById("dropZone");
    const fileInput = document.getElementById("fileInput");

    dropZone.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", async (e) => {
      if (e.target.files.length > 0) {
        await this.handleImageFiles(e.target.files);
        fileInput.value = "";
      }
    });

    dropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropZone.classList.add("drag-over");
    });
    dropZone.addEventListener("dragleave", () => {
      dropZone.classList.remove("drag-over");
    });
    dropZone.addEventListener("drop", async (e) => {
      e.preventDefault();
      dropZone.classList.remove("drag-over");
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        await this.handleImageFiles(e.dataTransfer.files);
      }
    });

    // 「imagesフォルダから既存画像を選択」ボタン & モーダル内イベント
    document.getElementById("openExistingImageBtn").addEventListener("click", async () => {
      await this.openExistingImagePicker();
    });

    document.getElementById("existingImageMinNum").addEventListener("input", async () => {
      await this.renderExistingImageGrid();
    });

    document.getElementById("existingImageMaxNum").addEventListener("input", async () => {
      await this.renderExistingImageGrid();
    });

    document.getElementById("clearExistingRangeBtn").addEventListener("click", async () => {
      document.getElementById("existingImageMinNum").value = "";
      document.getElementById("existingImageMaxNum").value = "";
      await this.renderExistingImageGrid();
    });

    document.getElementById("confirmExistingImageBtn").addEventListener("click", async () => {
      if (this.selectedExistingSet.size === 0) {
        this.closeModal("existingImageModal");
        return;
      }
      const addedList = Array.from(this.selectedExistingSet);
      for (const fname of addedList) {
        this.currentImages.push(fname);
      }
      await this.renderImagePreviews();
      this.closeModal("existingImageModal");
      this.showToast(`${addedList.length}枚の既存画像を追加しました`);
    });

    // フォーム送信（追加・編集確定）
    document.getElementById("archiveForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      await this.saveFormItem();
    });

    // 詳細モーダルからの編集・削除
    document.getElementById("detailEditBtn").addEventListener("click", () => {
      const id = this.activeDetailId;
      this.closeModal("detailModal");
      const targetItem = this.items.find((item) => item.id === id);
      if (targetItem) this.openEditModal(targetItem);
    });

    document.getElementById("detailDeleteBtn").addEventListener("click", async () => {
      const id = this.activeDetailId;
      if (await this.deleteItem(id)) {
        this.closeModal("detailModal");
      }
    });

    // JSONエクスポート（セーブ）
    document.getElementById("exportJsonBtn").addEventListener("click", async () => {
      const payload = this.createSavePayload();
      const jsonStr = JSON.stringify(payload, null, 2);
      const timestamp = new Date().toISOString().slice(0, 10);
      const safeTitle = payload.title
        ? payload.title.replace(/[\\/:*?"<>|]/g, "_")
        : "save";
      const exportFilename = `archive_${safeTitle}_${timestamp}.json`;

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
    });

    // JSONインポート（ロード）
    document.getElementById("importJsonInput").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        this.closeModal("saveLoadModal");
        await this.applySavePayload(parsed, true);
        await this.renderGrid();
        this.renderSaveSlots();
        this.showToast(`「${file.name}」からロードしました`);
      } catch (err) {
        alert("ファイルの読み込みに失敗しました: " + err.message);
      } finally {
        e.target.value = "";
      }
    });
  }

  // 既存画像選択ピッカーを開く
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
  }

  updateExistingSelectedCount() {
    const countEl = document.getElementById("existingSelectedCount");
    if (countEl) {
      countEl.textContent = `${this.selectedExistingSet.size} 枚選択中`;
    }
  }

  // 既存画像一覧グリッドを描画
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
  }

  // 追い打ち検索の条件を追加
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
  }

  // 追い打ち検索の適用中条件を search-panel 最上部に描画
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
      const targetLabel = ArchiveApp.TARGET_LABELS[filter.target] || filter.target;
      const matchLabel = ArchiveApp.MATCH_TYPE_LABELS[filter.matchType] || filter.matchType;

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
  }

  // ドロップされた画像ファイルを "img" + 数字 の連番で保存
  async handleImageFiles(fileList) {
    const imageFiles = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length === 0) {
      this.showToast("画像ファイルを選択してください");
      return;
    }

    // すでに images/ フォルダにある最大番号も考慮して重複を回避
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
  }

  // タグ追加処理
  addTagFromInput() {
    const input = document.getElementById("tagInput");
    const raw = input.value.replace(/,/g, "").trim();
    if (raw && !this.currentTags.includes(raw)) {
      this.currentTags.push(raw);
      this.renderTagChips();
    }
    input.value = "";
  }

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
  }

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
  }

  // 追加・編集モーダルを開く
  async openEditModal(item = null) {
    const titleEl = document.getElementById("editModalTitle");
    if (item) {
      titleEl.textContent = "データの編集";
      document.getElementById("itemId").value = item.id;
      document.getElementById("itemTitle").value = item.title || "";
      document.getElementById("itemSeries").value = item.series || "";
      document.getElementById("itemAuthor").value = item.author || "";
      document.getElementById("itemUrl").value = item.url || "";
      document.getElementById("itemMemo").value = item.memo || "";
      this.currentTags = Array.isArray(item.tags) ? [...item.tags] : [];
      this.currentImages = Array.isArray(item.images) ? [...item.images] : [];
    } else {
      titleEl.textContent = "新規データの登録";
      document.getElementById("archiveForm").reset();
      document.getElementById("itemId").value = "";
      this.currentTags = [];
      this.currentImages = [];
    }

    this.renderTagChips();
    await this.renderImagePreviews();
    this.openModal("editModal");
  }

  // データの保存（新規追加 or 上書き更新）
  async saveFormItem() {
    this.addTagFromInput();

    const id = document.getElementById("itemId").value;
    const itemData = {
      id: id || String(Date.now()),
      title: document.getElementById("itemTitle").value.trim(),
      series: document.getElementById("itemSeries").value.trim(),
      author: document.getElementById("itemAuthor").value.trim(),
      images: [...this.currentImages],
      url: document.getElementById("itemUrl").value.trim(),
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

  // データの削除
  async deleteItem(id) {
    const target = this.items.find((x) => x.id === id);
    if (!target) return false;
    if (!confirm(`「${target.title}」を削除してもよろしいですか？`)) return false;

    this.items = this.items.filter((x) => x.id !== id);
    this.autoSave();
    await this.renderGrid();
    this.showToast("データを削除しました");
    return true;
  }

  // 一覧の検索＆描画（追い打ち検索パイプライン ＋ 現在の入力欄）
  async renderGrid() {
    let filtered = [...this.items];
    for (const filter of this.searchFilters) {
      filtered = Searcher.search(filtered, filter.word, filter.target, filter.matchType);
    }

    const target = document.getElementById("searchTarget").value;
    const matchType = document.getElementById("searchMatchType").value;
    const searchWord = document.getElementById("searchWord").value;
    filtered = Searcher.search(filtered, searchWord, target, matchType);

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

      const tagsHtml = (item.tags || [])
        .map((t) => `<span class="tag-badge" data-tag="${this.escapeHtml(t)}">#${this.escapeHtml(t)}</span>`)
        .join("");

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
          ${
            item.url
              ? `<a href="${this.escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" class="card-link">🔗 リンク</a>`
              : ""
          }
          <div class="card-actions">
            <button type="button" class="btn btn-secondary btn-sm btn-edit">編集</button>
            <button type="button" class="btn btn-danger btn-sm btn-delete">削除</button>
          </div>
        </div>
      `;

      card.querySelector(".card-thumb").addEventListener("click", () => this.openDetailModal(item));
      card.querySelector(".card-title").addEventListener("click", () => this.openDetailModal(item));

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
  }

  // 詳細モーダル表示
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

    document.getElementById("detailBody").innerHTML = `
      ${galleryHtml}
      <table class="detail-meta-table">
        <tr><th>シリーズ</th><td>${this.escapeHtml(item.series || "—")}</td></tr>
        <tr><th>作者</th><td>${this.escapeHtml(item.author || "—")}</td></tr>
        <tr><th>URL</th><td>${
          item.url
            ? `<a href="${this.escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" class="card-link">${this.escapeHtml(item.url)}</a>`
            : "—"
        }</td></tr>
        <tr><th>タグ</th><td>${tagsHtml || "—"}</td></tr>
        <tr><th>登録画像ファイル</th><td>${(item.images || []).map((f) => this.escapeHtml(f)).join(", ") || "なし"}</td></tr>
      </table>
      <div>
        <h4 style="font-size:0.85rem;color:var(--text-muted);margin-bottom:0.4rem;">説明文兼メモ</h4>
        <div class="detail-memo-box">${this.escapeHtml(item.memo || "（メモなし）")}</div>
      </div>
    `;

    this.openModal("detailModal");
  }

  // セーブスロット取得・保存ヘルパー
  getSaveSlots() {
    try {
      return JSON.parse(localStorage.getItem(ArchiveApp.SAVE_CONFIG.storageKeySlots)) || {};
    } catch {
      return {};
    }
  }

  saveSlotsToStorage(slots) {
    localStorage.setItem(ArchiveApp.SAVE_CONFIG.storageKeySlots, JSON.stringify(slots));
  }

  // セーブスロット描画（SAVE_CONFIG.slotCount の数だけ自動生成）
  renderSaveSlots() {
    const slots = this.getSaveSlots();
    const container = document.getElementById("saveSlotList");
    container.innerHTML = "";

    const totalSlots = ArchiveApp.SAVE_CONFIG.slotCount;

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
      card.querySelector(".btn-slot-save").addEventListener("click", () => {
        if (data && !confirm(`SLOT ${slotNum} の既存データに上書きセーブしますか？`)) return;
        const currentSlots = this.getSaveSlots();
        currentSlots[slotKey] = this.createSavePayload();
        this.saveSlotsToStorage(currentSlots);
        this.renderSaveSlots();
        this.showToast(`SLOT ${slotNum} にセーブしました`);
      });

      // ロード実行
      if (data) {
        card.querySelector(".btn-slot-load").addEventListener("click", async () => {
          if (!confirm(`SLOT ${slotNum} のデータをロードしますか？（現在の未セーブ状態は上書きされます）`)) return;
          this.closeModal("saveLoadModal");
          await this.applySavePayload(data, true);
          await this.renderGrid();
          this.showToast(`SLOT ${slotNum} からロードしました`);
        });

        // クリア実行（スロットを初期状態に上書き・削除）
        card.querySelector(".btn-slot-clear").addEventListener("click", () => {
          if (!confirm(`SLOT ${slotNum} のセーブデータを削除して初期状態（空きスロット）に戻しますか？`)) return;
          const currentSlots = this.getSaveSlots();
          delete currentSlots[slotKey];
          this.saveSlotsToStorage(currentSlots);
          this.renderSaveSlots();
          this.showToast(`SLOT ${slotNum} をクリアしました`);
        });
      }

      container.appendChild(card);
    }
  }

  openModal(id) {
    document.getElementById(id).classList.remove("hidden");
  }

  closeModal(id) {
    document.getElementById(id).classList.add("hidden");
  }

  showToast(message) {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.classList.remove("hidden");
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      toast.classList.add("hidden");
    }, 3000);
  }

  escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&")
      .replace(/</g, "<")
      .replace(/>/g, ">")
      .replace(/"/g, '"')
      .replace(/'/g, "'");
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const app = new ArchiveApp();
  app.init();
});

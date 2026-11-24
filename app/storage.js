/**
 * @fileoverview 画像ストレージおよびローカルフォルダ連携を管理するクラス定義
 */

/**
 * 画像ストレージ管理クラス
 * - フォルダ連携中: 指定フォルダ内の "images/" のみで画像を管理（ブラウザ内ストレージへは複製しない）
 * - 未連携 / フォールバック時: IndexedDB の "images" ストアで画像を管理
 */
class ImageStorageManager {
  /**
   * ImageStorageManager のインスタンスを初期化する
   */
  constructor() {
    /**
     * 連携中のルートディレクトリハンドル
     * @type {FileSystemDirectoryHandle|null}
     */
    this.rootDirHandle = null;

    /**
     * 連携フォルダ内の images/ ディレクトリハンドル
     * @type {FileSystemDirectoryHandle|null}
     */
    this.imagesDirHandle = null;

    /**
     * IndexedDB に保存されているフォルダハンドルの識別ID
     * @type {string|null}
     */
    this.currentHandleId = null;

    /**
     * 現在連携中のフォルダ名
     * @type {string|null}
     */
    this.currentFolderName = null;

    /**
     * IndexedDB データベースインスタンス
     * @type {IDBDatabase|null}
     */
    this.db = null;

    /**
     * 画像ファイル名と生成済み ObjectURL のキャッシュマップ
     * @type {Map<string, string>}
     */
    this.urlCache = new Map();
  }

  /**
   * IndexedDB（ArchiveImageDB）を初期化して接続する
   * @returns {Promise<void>}
   */
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

  /**
   * フォルダハンドルを IndexedDB に保存し、識別IDを返す（既存同一フォルダがあれば再利用）
   * @param {FileSystemDirectoryHandle} dirHandle - 保存対象のディレクトリハンドル
   * @returns {Promise<string>} フォルダハンドル識別ID
   */
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

  /**
   * ユーザーにPC上のフォルダを選択させ、その中の images/ フォルダを準備して連携する
   * @returns {Promise<string>} 選択されたフォルダ名
   * @throws {Error} ブラウザ非対応または権限エラー時
   */
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

  /**
   * フォルダ連携を解除し、ブラウザ内ストレージモードへ切り替える
   * @returns {void}
   */
  disconnectFolder() {
    this.rootDirHandle = null;
    this.imagesDirHandle = null;
    this.currentHandleId = null;
    this.currentFolderName = null;
    this.clearUrlCache();
  }

  /**
   * ブラウザ内ストレージ（IndexedDB の images ストア）の画像をすべて削除する
   * @returns {Promise<void>}
   */
  async clearBrowserImages() {
    this.clearUrlCache();
    if (!this.db) return;
    await new Promise((resolve, reject) => {
      const tx = this.db.transaction("images", "readwrite");
      const store = tx.objectStore("images");
      store.clear();
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e);
    });
  }

  /**
   * セーブデータ記録用の連携フォルダメタ情報を取得する
   * @returns {LinkedFolderMeta|null} 連携中のメタデータ（未連携時は null）
   */
  getLinkedFolderMeta() {
    if (!this.isFolderConnected()) return null;
    return {
      handleId: this.currentHandleId,
      folderName: this.currentFolderName
    };
  }

  /**
   * セーブデータに記録された連携フォルダへの接続を復元する
   * @param {LinkedFolderMeta|null|undefined} linkedFolderMeta - セーブデータ内の連携フォルダ情報
   * @param {boolean} [allowPrompt=false] - 権限プロンプト表示を許可するかどうか
   * @returns {Promise<{status: "none"|"connected"|"needs_relink", folderName?: string}>} 復元結果
   */
  async restoreLinkedFolder(linkedFolderMeta, allowPrompt = false) {
    if (!linkedFolderMeta || !linkedFolderMeta.handleId) {
      this.disconnectFolder();
      return { status: "none" };
    }

    const folderName = linkedFolderMeta.folderName || "指定フォルダ";

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

  /**
   * 現在ローカルフォルダと連携中かどうかを判定する
   * @returns {boolean} 連携中なら true
   */
  isFolderConnected() {
    return Boolean(this.imagesDirHandle);
  }

  /**
   * キャッシュ済みの ObjectURL をすべて解放してクリアする
   * @returns {void}
   */
  clearUrlCache() {
    for (const url of this.urlCache.values()) {
      URL.revokeObjectURL(url);
    }
    this.urlCache.clear();
  }

  /**
   * 画像ファイルを現在の保存先（連携フォルダの images/ または IndexedDB）へ保存する
   * @param {File|Blob} file - 保存する画像ファイル
   * @param {string} filename - 保存先ファイル名（例: "img1.png"）
   * @returns {Promise<string>} 保存されたファイル名
   */
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

  /**
   * 現在の保存先に存在する画像ファイル名一覧を自然順ソートで取得する
   * @returns {Promise<string[]>} 画像ファイル名の配列
   */
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

    filenames.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
    return filenames;
  }

  /**
   * ファイル名から画面表示用の ObjectURL を取得する
   * @param {string} filename - 画像ファイル名（例: "img1.png"）
   * @returns {Promise<string|null>} ObjectURL（取得不可時は null）
   */
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

  /**
   * 連携フォルダ直下（images と同階層）にエクスポート用 JSON ファイルを書き出す
   * @param {string} filename - 出力ファイル名
   * @param {string} jsonString - JSON 文字列
   * @returns {Promise<boolean>} 書き出し成功時 true、未連携時 false
   */
  async writeFolderJsonFile(filename, jsonString) {
    if (!this.rootDirHandle) return false;
    const fileHandle = await this.rootDirHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(jsonString);
    await writable.close();
    return true;
  }
}
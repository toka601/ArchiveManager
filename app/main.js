/**
 * @fileoverview ArchiveApp クラス本体（状態フィールド・初期化・イベントバインド・起動処理）
 */

/**
 * アーカイブアプリケーション本体クラス
 */
class ArchiveApp {
  /**
   * ArchiveApp の各種状態フィールドを初期化する
   */
  constructor() {
    /**
     * 現在のアーカイブ（セーブデータ）に対するタイトル
     * @type {string}
     */
    this.archiveTitle = "";

    /**
     * 登録されているアーカイブアイテム一覧
     * @type {ArchiveItem[]}
     */
    this.items = [];

    /**
     * 画像ファイル自動命名用の連番カウンター（"img" + 数字、単調増加）
     * @type {number}
     */
    this.imageCounter = 1;

    /**
     * 画像・フォルダ連携ストレージ管理インスタンス
     * @type {ImageStorageManager}
     */
    this.storage = new ImageStorageManager();

    /**
     * 追い打ち検索の確定済みフィルター条件一覧
     * @type {SearchFilter[]}
     */
    this.searchFilters = [];

    /**
     * フォーム編集中のURL一覧（ラベル付き）
     * @type {UrlEntry[]}
     */
    this.currentUrls = [];

    /**
     * フォーム編集中の代表URLインデックス
     * @type {number}
     */
    this.currentPrimaryUrlIndex = 0;

    /**
     * フォーム編集中のタグ一覧
     * @type {string[]}
     */
    this.currentTags = [];

    /**
     * フォーム編集中の画像ファイル名一覧
     * @type {string[]}
     */
    this.currentImages = [];

    /**
     * 詳細モーダルで現在表示中のアイテムID
     * @type {string|null}
     */
    this.activeDetailId = null;

    /**
     * 既存画像ピッカーで参照可能な画像ファイル名一覧
     * @type {string[]}
     */
    this.availableExistingImages = [];

    /**
     * 既存画像ピッカーでユーザーが選択中の画像ファイル名集合
     * @type {Set<string>}
     */
    this.selectedExistingSet = new Set();

    /**
     * 独自確認モーダルの Promise 解決用コールバック関数
     * @type {((result: boolean) => void)|null}
     */
    this.confirmResolver = null;

    /**
     * トースト自動非表示用のタイマーID
     * @type {number|undefined}
     */
    this.toastTimer = undefined;
  }

  /**
   * アプリケーションの初期化（DB接続・オートセーブ復元・UI描画）を実行する
   * @returns {Promise<void>}
   */
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

    this.syncVersionUI();
    this.syncImageCounterWithData();
    this.syncArchiveTitleUI();
    this.updateFolderStatusUI();
    this.renderActiveFilters();
    await this.renderGrid();
  }

  /**
   * 画面上の各UI要素へイベントリスナーを登録する
   * @returns {void}
   */
  bindEvents() {
    // バージョンボタン押下で更新履歴モーダルを開く
    document.getElementById("openVersionModalBtn").addEventListener("click", () => {
      this.renderVersionHistory();
      this.openModal("versionModal");
    });

    // 独自確認モーダル内のイベント
    document.getElementById("customConfirmOkBtn").addEventListener("click", () => {
      this.resolveConfirm(true);
    });
    document.getElementById("customConfirmCancelBtn").addEventListener("click", () => {
      this.resolveConfirm(false);
    });
    document.getElementById("customConfirmCloseBtn").addEventListener("click", () => {
      this.resolveConfirm(false);
    });
    document.getElementById("customConfirmBackdrop").addEventListener("click", () => {
      this.resolveConfirm(false);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.confirmResolver) {
        e.preventDefault();
        this.resolveConfirm(false);
      }
    });

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
        await this.showNotice("連携フォルダのエラー", err.message);
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
        await this.showNotice("連携フォルダのエラー", err.message);
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

    // 今開いているデータを空にするボタン
    document.getElementById("resetCurrentDataBtn").addEventListener("click", async () => {
      await this.resetCurrentData();
    });

    // モーダル閉じる共通処理
    document.querySelectorAll("[data-close]").forEach((el) => {
      el.addEventListener("click", () => {
        this.closeModal(el.getAttribute("data-close"));
      });
    });

    // URL複数登録（ラベル入力欄・URL入力欄でのEnter または 追加ボタン）
    const urlLabelInput = document.getElementById("urlLabelInput");
    const urlInput = document.getElementById("urlInput");
    const handleUrlEnter = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.addUrlFromInput();
      }
    };
    urlLabelInput.addEventListener("keydown", handleUrlEnter);
    urlInput.addEventListener("keydown", handleUrlEnter);
    document.getElementById("addUrlBtn").addEventListener("click", () => {
      this.addUrlFromInput();
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

    // 画像ドラッグ＆ドロップ & ファイル選択 & ペースト
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
      if (e.dataTransfer) {
        await this.handleDroppedDataTransfer(e.dataTransfer);
      }
    });

    // 登録・編集モーダルが開いている間の画像ペースト（Ctrl+V / Cmd+V）対応
    document.addEventListener("paste", async (e) => {
      const editModal = document.getElementById("editModal");
      if (!editModal || editModal.classList.contains("hidden")) return;
      if (!e.clipboardData) return;

      const pastedFiles = Array.from(e.clipboardData.files || []).filter((f) =>
        f.type.startsWith("image/")
      );
      if (pastedFiles.length > 0) {
        e.preventDefault();
        await this.handleImageFiles(pastedFiles);
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
      await this.exportJsonFile();
    });

    // JSONインポート（ロード）
    document.getElementById("importJsonInput").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      await this.importJsonFile(file);
      e.target.value = "";
    });
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const app = new ArchiveApp();
  app.init();
});

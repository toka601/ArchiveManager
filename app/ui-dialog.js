/**
 * @fileoverview 汎用UI・ダイアログ・トースト・バージョン表示・ユーティリティメソッド群
 */

Object.assign(ArchiveApp.prototype, {
  /**
   * ヘッダーとモーダル内の現在バージョン表示を同期する
   * @this {ArchiveApp}
   * @returns {void}
   */
  syncVersionUI() {
    const badgeBtn = document.getElementById("openVersionModalBtn");
    if (badgeBtn) {
      badgeBtn.textContent = ArchiveConfig.APP_VERSION;
    }
    const currentText = document.getElementById("appCurrentVersionText");
    if (currentText) {
      currentText.textContent = ArchiveConfig.APP_VERSION;
    }
  },

  /**
   * バージョン情報・更新履歴モーダル内の履歴一覧を描画する
   * @this {ArchiveApp}
   * @returns {void}
   */
  renderVersionHistory() {
    const container = document.getElementById("versionHistoryList");
    if (!container) return;
    container.innerHTML = "";

    ArchiveConfig.VERSION_HISTORY.forEach((entry, index) => {
      const card = document.createElement("div");
      card.className = "version-entry" + (index === 0 ? " is-latest" : "");
      const changesHtml = (entry.changes || [])
        .map((line) => `<li>${this.escapeHtml(line)}</li>`)
        .join("");

      card.innerHTML = `
        <div class="version-entry-header">
          <span class="version-tag">${this.escapeHtml(entry.version)}</span>
          <span class="version-entry-title">${this.escapeHtml(entry.title)}</span>
        </div>
        <ul class="version-changes">${changesHtml}</ul>
      `;
      container.appendChild(card);
    });
  },

  /**
   * 指定された文字列をクリップボードへコピーし、トーストで通知する
   * @this {ArchiveApp}
   * @param {string} text - コピーする文字列
   * @returns {Promise<void>}
   */
  async copyToClipboard(text) {
    if (!text) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        this.showToast("リンクをコピーしました");
        return;
      }
    } catch (e) {
      console.warn("Clipboard APIフォールバックへ移行:", e);
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand("copy");
      this.showToast("リンクをコピーしました");
    } catch {
      this.showToast("コピーに失敗しました");
    } finally {
      document.body.removeChild(textarea);
    }
  },

  /**
   * 独自確認モーダルを表示してユーザーの選択結果（true / false）を返す
   * @this {ArchiveApp}
   * @param {Object} options - モーダル表示オプション
   * @param {string} [options.title="確認"] - ダイアログタイトル
   * @param {string} [options.message=""] - 本文メッセージ
   * @param {string} [options.confirmText="OK"] - 確定ボタンのラベル
   * @param {string} [options.cancelText="キャンセル"] - キャンセルボタンのラベル
   * @param {boolean} [options.isDanger=false] - 危険操作（赤ボタン）にするかどうか
   * @param {boolean} [options.hideCancel=false] - キャンセルボタンを非表示にするかどうか
   * @returns {Promise<boolean>} ユーザーがOKを押下した場合 true、キャンセル時 false
   */
  showConfirm({
    title = "確認",
    message = "",
    confirmText = "OK",
    cancelText = "キャンセル",
    isDanger = false,
    hideCancel = false
  }) {
    return new Promise((resolve) => {
      if (this.confirmResolver) {
        this.confirmResolver(false);
      }
      this.confirmResolver = resolve;

      document.getElementById("customConfirmTitle").textContent = title;
      document.getElementById("customConfirmMessage").textContent = message;

      const okBtn = document.getElementById("customConfirmOkBtn");
      const cancelBtn = document.getElementById("customConfirmCancelBtn");

      okBtn.textContent = confirmText;
      okBtn.className = isDanger ? "btn btn-danger" : "btn btn-primary";

      cancelBtn.textContent = cancelText;
      cancelBtn.style.display = hideCancel ? "none" : "inline-flex";

      this.openModal("customConfirmModal");
      okBtn.focus();
    });
  },

  /**
   * 独自通知モーダル（OKのみ）を表示する
   * @this {ArchiveApp}
   * @param {string} title - 通知タイトル
   * @param {string} message - 通知メッセージ
   * @returns {Promise<boolean>} 閉じた際に true で解決する Promise
   */
  showNotice(title, message) {
    return this.showConfirm({
      title,
      message,
      confirmText: "閉じる",
      hideCancel: true
    });
  },

  /**
   * 独自確認モーダルを閉じ、待機中の Promise を解決する
   * @this {ArchiveApp}
   * @param {boolean} result - 選択結果
   * @returns {void}
   */
  resolveConfirm(result) {
    this.closeModal("customConfirmModal");
    if (this.confirmResolver) {
      const resolver = this.confirmResolver;
      this.confirmResolver = null;
      resolver(result);
    }
  },

  /**
   * 指定されたIDのモーダルを開く
   * @this {ArchiveApp}
   * @param {string} id - モーダル要素のID
   * @returns {void}
   */
  openModal(id) {
    document.getElementById(id).classList.remove("hidden");
  },

  /**
   * 指定されたIDのモーダルを閉じる
   * @this {ArchiveApp}
   * @param {string} id - モーダル要素のID
   * @returns {void}
   */
  closeModal(id) {
    document.getElementById(id).classList.add("hidden");
  },

  /**
   * 画面下部にトーストメッセージを一定時間表示する
   * @this {ArchiveApp}
   * @param {string} message - 表示メッセージ
   * @returns {void}
   */
  showToast(message) {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.classList.remove("hidden");
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      toast.classList.add("hidden");
    }, 3000);
  },

  /**
   * HTML特殊文字をエスケープして安全な文字列に変換する
   * @this {ArchiveApp}
   * @param {string} str - 変換元文字列
   * @returns {string} エスケープ済み文字列
   */
  escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&")
      .replace(/</g, "<")
      .replace(/>/g, ">")
      .replace(/"/g, '"')
      .replace(/'/g, "'");
  }
});
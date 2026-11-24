/**
 * @fileoverview アプリケーションの定数設定・バージョン更新履歴・共通型定義
 */

/**
 * ラベル付きURLエントリ
 * @typedef {Object} UrlEntry
 * @property {string} label - URLの用途を示すラベル（任意）
 * @property {string} url - URL文字列
 */

/**
 * アーカイブ登録アイテムのデータ構造
 * @typedef {Object} ArchiveItem
 * @property {string} id - 一意なアイテムID
 * @property {string} title - タイトル
 * @property {string} series - シリーズ名
 * @property {string} author - 作者名
 * @property {string[]} images - 登録画像ファイル名一覧（例: ["img1.png", "img2.jpg"]）
 * @property {UrlEntry[]} urls - 登録URL一覧（ラベル付き）
 * @property {number} primaryUrlIndex - 代表URLのインデックス（デフォルトは 0）
 * @property {string} url - 代表URL（旧バージョンおよび検索互換用）
 * @property {string[]} tags - タグ一覧
 * @property {string} memo - 説明文兼メモ
 * @property {string} updatedAt - 最終更新日時（ISO 8601形式）
 */

/**
 * 連携フォルダのメタデータ
 * @typedef {Object} LinkedFolderMeta
 * @property {string} handleId - IndexedDB内に保存されたフォルダハンドルの識別ID
 * @property {string} folderName - 連携フォルダ名
 */

/**
 * セーブデータ（オートセーブ・スロット・JSONエクスポート共通）のペイロード構造
 * @typedef {Object} SavePayload
 * @property {number} version - セーブデータフォーマットバージョン
 * @property {string} title - セーブデータタイトル
 * @property {string} savedAt - 保存日時文字列
 * @property {number} imageCounter - 画像連番カウンターの現在値
 * @property {LinkedFolderMeta|null} linkedFolder - 連携フォルダ情報
 * @property {ArchiveItem[]} items - 登録アイテム一覧
 */

/**
 * 追い打ち検索の確定済みフィルター条件
 * @typedef {Object} SearchFilter
 * @property {string} target - 検索対象フィールド名
 * @property {string} matchType - 検索一致方式
 * @property {string} word - 検索ワード
 */

/**
 * バージョン履歴エントリ
 * @typedef {Object} VersionEntry
 * @property {string} version - バージョン番号（例: "v1.7.0"）
 * @property {string} title - アップデート概要タイトル
 * @property {string[]} changes - 変更内容の箇条書きリスト
 */

/**
 * アプリケーション共通定数オブジェクト
 * @namespace ArchiveConfig
 */
const ArchiveConfig = {
  /**
   * 現在のアプリケーションバージョン
   * @type {string}
   */
  APP_VERSION: "v1.7.0",

  /**
   * バージョン更新履歴一覧（新しい順）
   * @type {VersionEntry[]}
   */
  VERSION_HISTORY: [
    {
      version: "v1.7.0",
      title: "JSONエクスポートのファイル名変更",
      changes: [
        "JSONエクスポートのファイル名を「archive_<セーブデータ名>_<日付>.json」から「archive_<セーブデータ名>_<日付>_<時刻>.json」に変更した。例: archive_example_20210101_1302.json",
        "時刻の指定により、同じ日付でも上書きにならない。"
      ]
    },
    {
      version: "v1.6.0",
      title: "URLごとのラベル設定・バージョン履歴表示を追加",
      changes: [
        "複数登録できるURLの1つ1つに一対の「ラベル」を設定・編集できるようにしました。",
        "代表URLにラベルが設定されている場合、一覧カードのリンク文字にそのラベル名を表示するようにしました。",
        "ヘッダーにバージョンボタンを追加し、これまでの更新履歴をポップアップで確認できるようにしました。"
      ]
    },
    {
      version: "v1.5.0",
      title: "複数URL登録・代表URL選択・リンク操作の分離",
      changes: [
        "1つのデータに対して複数のURLを登録し、カードリンクに使用する代表URL（★）を選択できるようにしました。",
        "リンクの「🔗」マーク押下でURLコピー、文字押下でリンク先へ遷移する仕様に分離しました。"
      ]
    },
    {
      version: "v1.4.0",
      title: "作業データのリセット機能と独自確認ダイアログの導入",
      changes: [
        "セーブ/ロード画面に「今開いているデータを空にする」ボタンを追加し、セーブスロットを残したまま作業領域や連携状態を初期化できるようにしました。",
        "ブラウザ標準のアラートを廃止し、アプリデザインに統一した独自の確認モーダルを導入しました。"
      ]
    },
    {
      version: "v1.3.0",
      title: "連携フォルダ再指定と既存画像の番号範囲ピッカー",
      changes: [
        "JSONロード時にフォルダ権限の再確認が必要な場合、その場で連携フォルダを選び直せるダイアログを追加しました。",
        "imagesフォルダ内の既存画像を再利用できるピッカーを追加し、番号範囲（最小〜最大）での絞り込みとスクロール表示に対応しました。",
        "登録・編集フォームの入力履歴サジェストを抑制しました。"
      ]
    },
    {
      version: "v1.2.0",
      title: "追い打ち検索と連携フォルダ直下へのJSON出力",
      changes: [
        "絞り込み結果に対してさらに別条件を重ねられる「追い打ち検索」と適用条件チップ表示を追加しました。",
        "連携フォルダ有効時、JSONファイルを指定フォルダ直下（imagesと同階層）へ直接書き出すようにしました。"
      ]
    },
    {
      version: "v1.1.0",
      title: "セーブデータタイトル・10スロット化・クリア機能",
      changes: [
        "ヘッダーからアーカイブ全体にセーブデータタイトルを付けられるようにしました。",
        "セーブスロットを10枠に拡張し、各スロットを空き状態へ戻す「クリア」ボタンとレイアウト調整を実施しました。"
      ]
    },
    {
      version: "v1.0.0",
      title: "Archive Manager 初期リリース",
      changes: [
        "作品・資料データの登録、編集、削除、詳細閲覧機能を実装しました。",
        "論理演算検索（AND / OR / 除外 / 括弧）およびビジュアル検索ビルダーを搭載しました。",
        "ローカルフォルダ連携（images/ 連番自動保存）とJSONセーブ/ロード機能を実装しました。"
      ]
    }
  ],

  /**
   * セーブスロット・ストレージキー設定
   * @type {{slotCount: number, storageKeyAutoSave: string, storageKeySlots: string}}
   */
  SAVE_CONFIG: {
    slotCount: 10,
    storageKeyAutoSave: "archive_app_autosave_v1",
    storageKeySlots: "archive_app_save_slots_v1"
  },

  /**
   * 検索対象キーの日本語ラベルマップ
   * @type {Object.<string, string>}
   */
  TARGET_LABELS: {
    all: "すべて",
    title: "タイトル",
    series: "シリーズ",
    author: "作者",
    tags: "タグ",
    memo: "説明文兼メモ",
    url: "URL"
  },

  /**
   * 検索一致方式キーの日本語ラベルマップ
   * @type {Object.<string, string>}
   */
  MATCH_TYPE_LABELS: {
    partial: "部分一致",
    exact: "完全一致",
    prefix: "前方一致",
    suffix: "後方一致",
    regex: "正規表現"
  }
};

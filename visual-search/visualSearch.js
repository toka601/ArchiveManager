/**
 * アーカイブサイト連携用ビジュアル検索モジュール
 * - 単独動作時に生成していた検索バー（createBar）を廃止し、
 *   指定された展開ボタンと検索ワード入力欄に直接接続する。
 */
class VisualSearch{
    /**
     * @param {HTMLElement} openButton - ビジュアル検索を展開するボタン要素
     * @param {HTMLInputElement} targetInput - 確定した条件式を反映する検索ワード入力欄
     * @param {HTMLElement} parent - オーバーレイを配置する親要素
     */
    static init(openButton, targetInput, parent = document.body){
        if(!openButton || !targetInput) return;

        Conditions.clear();

        const overlay = parent.appendChild(VisualSearch.createPopup());
        VSBlockList.refreshBlockList();

        // 開くボタンにバインド
        VSOpenButtonController.bind(openButton, overlay);
        // 確定ボタンにバインド（targetInput へ論理式を反映）
        VSConfirmButtonController.bind(targetInput, overlay);
    }

    static createPopup(){
        // オーバーレイ
        const overlay = document.createElement("div");
        overlay.id = "vs-overlay";
        Object.assign(overlay.style, {
            position: "fixed", 
            top: "0", left: "0", 
            width: "100%", height: "100%", 
            backgroundColor: "rgba(0, 0, 0, 0.7)", 
            backdropFilter: "blur(2px)",
            display: "none", 
            justifyContent: "center", 
            alignItems: "center", 
            zIndex: "999"
        });

        // ポップアップ
        const popup = overlay.appendChild(document.createElement("div"));
        popup.id = "vs-popup";
        Object.assign(popup.style, {
            width: "90%", maxWidth: "1100px", height: "90%", 
            backgroundColor: "rgba(255, 255, 255, 1)", 
            color: "#1e293b",
            borderRadius: "12px",
            position: "relative", 
            boxSizing: "border-box", 
            padding: "20px", 
            display: "flex", 
            flexDirection: "column",
            gap: "10px",
            boxShadow: "0 20px 40px rgba(0, 0, 0, 0.5)"
        });

        // 閉じるボタン
        const closeButton = popup.appendChild(document.createElement("button"));
        closeButton.id = "vs-close";
        closeButton.type = "button";
        closeButton.textContent = "×";
        Object.assign(closeButton.style, {
            position: "absolute", 
            top: "8px", right: "12px", 
            border: "none", 
            background: "none", 
            color: "#475569",
            fontSize: "24px", 
            cursor: "pointer",
            zIndex: "10"
        });
        VSCloseButtonController.bind(overlay, closeButton);

        const mainNode = popup.appendChild(document.createElement("div"));
        Object.assign(mainNode.style, {
            background: VSStyle.colors.whole, 
            borderRadius: "10px", 
            fontSize: "12px",
            padding: "10px",
            display: "flex",
            flexDirection: "column",
            flex: "1",
            minHeight: "0",
            gap: "10px"
        });

        const result = mainNode.appendChild(VSResult.render());       // 検索条件
        const canvas = mainNode.appendChild(VSCanvas.render());       // キャンバス
        const blockList = mainNode.appendChild(VSBlockList.render()); // ブロック一覧
        const tips = mainNode.appendChild(VSTips.render());           // ヒント
        VSDragBlockController.bind(canvas, blockList);

        // 確定ボタン
        const confirmButton = popup.appendChild(document.createElement("button"));
        confirmButton.id = "vs-confirm";
        confirmButton.type = "button";
        confirmButton.textContent = "確定して検索欄へ反映";
        Object.assign(confirmButton.style, {
            alignSelf: "flex-end", 
            padding: "8px 18px", 
            backgroundColor: "#3b82f6",
            color: "#ffffff",
            border: "none",
            borderRadius: "8px",
            fontWeight: "600",
            cursor: "pointer"
        });

        return overlay;
    }
}
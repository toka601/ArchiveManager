class VSTips{
    /**
     * ヒントボックスのノード生成
     * @returns {HTMLElement}
     */
    static render(){
        const area = document.createElement("div");
        area.id = "tips-area";
        Object.assign(area.style, {
            background: VSStyle.colors.tips.whole, 
            border: "1px solid rgba(0, 0, 0, 1)", 
            borderRadius: "10px",
            padding: "8px 10px", 
            paddingTop: "5px"
        });

        const header = document.createElement("div");
        header.id = "tips-header";
        header.textContent = "使い方: ";
        header.style.fontWeight = "600";
        area.appendChild(header);

        const contents = document.createElement("div");
        contents.id = "tips-contents";
        let text = "・ブロックをドラッグ＆ドロップしてキャンバスに配置します。";
            text += "\n・マウスで囲うと「または（論理和）」になります。";
            text += "\n・囲わずに並べたブロックは「かつ（論理積）」になります。";
            text += "\n・ブロックをクリックして黒くすると「～ではない（否定）」になります。";
        contents.textContent = text;
        Object.assign(contents.style, {
            fontSize: "11px", 
            whiteSpace: "pre-wrap", 
            display: "inline-block"
        });
        area.appendChild(contents);

        return area;
    }
}
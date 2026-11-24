class VSResult{
    /**
     * 検索条件出力ボックスのノード生成
     * @returns {HTMLElement}
     */
    static render(){
        const area = document.createElement("div");
        area.id = "result-area";
        Object.assign(area.style, {
            border: "1px solid rgba(0, 0, 0, 1)", 
            borderRadius: "10px",
            padding: "10px", 
            paddingTop: "5px",
            paddingRight: "36px"
        });

        const header = document.createElement("div");
        header.id = "result-header";
        header.textContent = "検索条件(文章)";
        header.style.fontWeight = "600";
        header.style.marginBottom = "4px";
        area.appendChild(header);

        const textBox = document.createElement("div");
        textBox.id = "result-textbox";
        textBox.textContent = "条件文";
        Object.assign(textBox.style, {
            border: "1px solid rgba(0, 0, 0, 0.8)", 
            borderRadius: "8px",
            fontSize: "12px", 
            color: "rgba(0, 0, 0, 0.85)",
            padding: "5px 8px"
        });
        area.appendChild(textBox);

        return area;
    }

    // リザルトへ反映
    static updateResult(){
        const textBox = document.getElementById("result-textbox");
        if(!textBox) return;

        const text = VSQueryBuilder.buildQuery();
        textBox.textContent = text || "条件文";
    }
}
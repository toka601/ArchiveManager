class VSBlockList{
    static get node(){
        return document.getElementById("blockList-area");
    }

    /**
     * ブロック一覧のノード生成
     * @returns {HTMLElement}
     */
    static render(){
        const area = document.createElement("div");
        area.id = "blockList-area";
        Object.assign(area.style, {
            border: "1px solid rgba(0, 0, 0, 1)", 
            borderRadius: "10px", 
            padding: "10px", 
            paddingTop: "5px"
        });

        // ヘッダー
        const header = document.createElement("div");
        header.id = "blockList-header";
        header.textContent = "アイテム一覧（下の入力欄から検索ワードを追加してキャンバスへドラッグ）";
        header.style.fontWeight = "600";
        header.style.marginBottom = "4px";
        area.appendChild(header);

        // ブロックリスト
        const blockList = document.createElement("div");
        blockList.id = "block-list";
        Object.assign(blockList.style, {
            display: "grid", 
            gridTemplateColumns: "repeat(6, 1fr)",
            minHeight: "38px",
            border: "1px solid rgba(0, 0, 0, 0.3)",
            borderRadius: "10px",
            padding: "5px",
            gap: "10px"
        });

        for(const blockData of Conditions.blocks){
            blockList.appendChild(VSBlock.createBlockNode(blockData));
        }
        area.appendChild(blockList);
    
        // 入力ボックスと追加ボタン
        const editArea = document.createElement("div");
        Object.assign(editArea.style, {
            display: "flex", 
            flexWrap: "wrap",
            justifyContent: "flex-end",
            alignItems: "center",
            marginTop: "10px",
            gap: "6px"
        });

        const clearButton = document.createElement("button");
        clearButton.id = "clear-button";
        clearButton.type = "button";
        clearButton.textContent = "全消去";
        Object.assign(clearButton.style, {
            display: "none",
            padding: "4px 10px",
            borderRadius: "8px",
            border: "1px solid #ef4444",
            background: "#fee2e2",
            color: "#b91c1c",
            cursor: "pointer"
        });
        VSClearButtonController.bind(clearButton);
        editArea.appendChild(clearButton);
        
        // 消しゴムボタン
        const eraserButton = document.createElement("button");
        eraserButton.id = "eraser-button";
        eraserButton.type = "button";
        eraserButton.textContent = "消しゴムモード";
        Object.assign(eraserButton.style, {
            padding: "4px 10px",
            borderRadius: "8px",
            border: "1px solid rgba(0, 0, 0, 0.4)",
            background: "#f1f5f9",
            color: "#1e293b",
            cursor: "pointer"
        });
        VSEraserButtonController.bind(eraserButton);
        editArea.appendChild(eraserButton);

        // 入力ボックス
        const inputBox = document.createElement("input");
        inputBox.id = "input-textBox";
        inputBox.placeholder = "新しいワード";
        Object.assign(inputBox.style, {
            background: VSStyle.colors.list.inputBox, 
            border: "1px dashed rgba(0, 0, 0, 0.6)", 
            borderRadius: "10px",
            padding: "4px 8px"
        });
        VSInputBoxController.bind(inputBox);
        editArea.appendChild(inputBox);

        // +追加ボタン
        const addButton = document.createElement("button");
        addButton.id = "add-button";
        addButton.type = "button";
        addButton.textContent = " + 追加";
        Object.assign(addButton.style, {
            background: VSStyle.colors.list.add, 
            border: "none",
            borderRadius: "10px", 
            color: "rgba(255, 255, 255, 1)",
            padding: "5px 12px",
            cursor: "pointer"
        });
        VSAddButtonController.bind(addButton);
        editArea.appendChild(addButton);

        // 削除エリア(ゴミ箱)
        const trashArea = document.createElement("div");
        trashArea.id = "trash-area";
        trashArea.textContent = "🗑 ゴミ箱";
        Object.assign(trashArea.style, {
            background: VSStyle.colors.list.trash, 
            border: "1px solid rgba(0, 0, 0, 0.6)", 
            borderRadius: "10px", 
            color: "rgba(0, 0, 0, 0.7)",
            padding: "4px 10px"
        });
        VSTrashAreaController.bind(trashArea);
        editArea.appendChild(trashArea);

        area.appendChild(editArea);

        return area;
    }

    /**
     * テキストボックスに書かれた検索ワードを元に条件ブロックを作成・追加する
     */
    static addBlock(){
        const textBox = document.getElementById("input-textBox");
        if(!textBox) return;

        const text = textBox.value.trim();

        if(text){
            Conditions.add(text);
            VSBlockList.refreshBlockList();
            textBox.value = "";
        }
    }

    /**
     * ブロック一覧再描画
     */
    static refreshBlockList(){
        const blockList = document.getElementById("block-list");
        if(!blockList) return;

        blockList.replaceChildren();

        for(const blockData of Conditions.blocks){
            const node = VSBlock.createBlockNode(blockData);
            blockList.appendChild(node);
        }
    }
}
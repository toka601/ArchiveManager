class VSBlock{
    /**
     * 親ブロックの生成
     * @param {Condition} blockData 
     * @returns {HTMLElement}
     */
    static createBlockNode(blockData){
        const node = document.createElement("div");
        node.textContent = blockData.text;
        node.draggable = true;
        node.dataset.id = blockData.id;
        Object.assign(node.style, {
            background: VSStyle.colors.block[blockData.colorIndex], 
            color: "#1e293b",
            fontWeight: "600",
            borderRadius: "10px",
            overflowX: "auto",
            textAlign: "center", 
            cursor: "pointer",
            padding: "5px"
        });
        VSBlockController.bind(node, blockData);
        return node;
    }

    /**
     * ドラッグ中の一時的なブロック
     * @param {Condition} blockData 
     * @returns {HTMLDivElement} 
     */
    static createDraggingPreviewNode(blockData){
        const node = VSBlock.createCanvasBlockNode(blockData, DragState.width, DragState.height);
        Object.assign(node.style, {
            opacity: "0.75", 
            position: "fixed", 
            left: "0", 
            top: "0", 
            zIndex: "9999",
            pointerEvents: "none", 
            transform: "translate(-50%, -50%) scale(1.05)"
        });
        return node;
    }
    
    /**
     * 子ブロックの生成
     * @param {Condition} blockData 
     * @param {number} width
     * @param {number} height
     * @returns {HTMLElement}
     */
    static createCanvasBlockNode(blockData, width = null, height = null){
        const node = document.createElement("div");
        node.textContent = blockData.text;
        node.dataset.id = blockData.id;
        node.dataset.sourceId = blockData.id;
        node.dataset.isNot = "false";
        Object.assign(node.style, {
            background: VSStyle.colors.block[blockData.colorIndex],
            borderRadius: "10px",
            position: "absolute", 
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "4px 10px",
            overflow: "auto", 
            zIndex: "10", 
            whiteSpace: "nowrap", 
            textAlign: "center", 
            color: "black", 
            fontWeight: "600",
            cursor: "pointer",
            resize: "none"
        });
        if(width) node.style.width = width + "px";
        if(height) node.style.height = height + "px";
        VSCanvasBlockController.bind(node, blockData);
        return node;
    }

    /**
     * Canvas上の子ブロックの色を再同期
     */
    static refreshCanvasBlockColors(){
        document.querySelectorAll("[data-source-id]")
            .forEach(node => {
                const sourceId = Number(node.dataset.sourceId);
                const block = Conditions.blocks.find( b => b.id === sourceId );
                if(!block) return;

                const isNot = node.dataset.isNot === "true";
                Object.assign(node.style, {
                    background: isNot ? VSStyle.colors.blocks.negBlock : VSStyle.colors.block[block.colorIndex], 
                    color: isNot ? "white" : "black"
                });
            });
    }
}

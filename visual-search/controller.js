class VSCanvasController{
    static drawing = false;
    static currentLoop = null;

    static bind(canvas, drawCanvas){
        VSCanvasController.dragOver(canvas);
        VSCanvasController.drop(canvas);
        VSCanvasController.mouseDown(canvas);
        VSCanvasController.mouseMove(canvas);
        VSCanvasController.mouseUp(canvas);
        VSCanvasController.resize(canvas, drawCanvas);
    }

    static dragOver(canvas){
        canvas.addEventListener("dragover", (e) => {
            e.preventDefault();
        });
    }
    static drop(canvas){
        canvas.addEventListener("drop", (e) => {
            e.preventDefault();

            const id = Number(e.dataTransfer.getData("text/plain"));
            const blockData = Conditions.blocks.find(b => b.id === id);
            if(!blockData) return;

            const node = VSBlock.createCanvasBlockNode(blockData, DragState.width, DragState.height);
            const rect = canvas.getBoundingClientRect();
            Object.assign(node.style, {
                position: "absolute", 
                left: (e.clientX - rect.left) + "px", 
                top:  (e.clientY - rect.top)  + "px"
            });
            canvas.appendChild(node);
            requestAnimationFrame(()=>{ VSResult.updateResult(); });
        });
    }
    static mouseDown(canvas){
        canvas.addEventListener("mousedown",(e)=>{
            if( e.target.dataset.sourceId || e.target.id === "canvas-tips") return;

            const rect = canvas.getBoundingClientRect();
            VSCanvasController.drawing = true;
            VSCanvasController.currentLoop = new DrawLoop();

            VSCanvasController.currentLoop.points.push({ x:e.clientX - rect.left, y:e.clientY - rect.top });
        });
    }
    static mouseMove(canvas){
        canvas.addEventListener("mousemove",(e)=>{
            if(!(VSCanvasController.drawing)) return;

            const rect = canvas.getBoundingClientRect();
            VSCanvasController.currentLoop.points.push({ x:e.clientX - rect.left, y:e.clientY - rect.top });
            VSCanvas.redrawLoops(VSCanvasController.currentLoop);
        });
    }

    static finishDrawing(){
        if(!(VSCanvasController.drawing)) return;

        VSCanvasController.drawing = false;
        if(VSCanvasController.currentLoop.points.length > 2){
            if(CanvasState.isEraserMode){
                const hitLoops = VSCanvas.findIntersectLoops(VSCanvasController.currentLoop.points);
                CanvasState.loops = CanvasState.loops.filter( (_,index)=>!hitLoops.includes(index) );
            }else{
                CanvasState.loops.push(VSCanvasController.currentLoop);
            }
        }

        VSResult.updateResult();
        VSCanvas.redrawLoops();
    }
    static mouseUp(canvas){
        document.addEventListener("mouseup", ()=>VSCanvasController.finishDrawing() );
        document.addEventListener("pointerup", ()=>VSCanvasController.finishDrawing() );
        document.addEventListener("mouseleave", ()=>VSCanvasController.finishDrawing() );
        window.addEventListener("blur", ()=>VSCanvasController.finishDrawing() );
    }
    static resize(canvas, drawCanvas){
        window.addEventListener("resize",()=>{
            if(!canvas.clientWidth || !canvas.clientHeight) return;
            drawCanvas.width = canvas.clientWidth;
            drawCanvas.height = canvas.clientHeight;
            VSCanvas.redrawLoops();
        });
    }
}

class VSDragBlockController{
    static bind(canvas, blockList){
        VSDragBlockController.mouseMove();
        VSDragBlockController.mouseUp(canvas, blockList);
    }
    static mouseMove(){
        document.addEventListener("mousemove", (e) => {
            const preview = DragState.previewNode;
            if(preview) Object.assign(preview.style, {
                left: e.pageX + "px", 
                top: e.pageY + "px"
            });
        });
    }
    static mouseUp(canvas, blockList){
        const canvasArea = canvas.querySelector("#canvas-canvas");
        const trashArea = blockList.querySelector("#trash-area");
        document.addEventListener("mouseup", (e) => {
            const id = DragState.blockId;
            const preview = DragState.previewNode;
            if(!id || !preview) return;

            const canvasRect = canvasArea.getBoundingClientRect();
            const trashRect = trashArea.getBoundingClientRect();

            const inCanvas = e.clientX >= canvasRect.left && e.clientX <= canvasRect.right
                            && e.clientY >= canvasRect.top  && e.clientY <= canvasRect.bottom;
            const inTrash  = e.clientX >= trashRect.left && e.clientX <= trashRect.right
                            && e.clientY >= trashRect.top  && e.clientY <= trashRect.bottom;

            if(inCanvas){
                const blockData = Conditions.blocks.find(b => b.id === id);
                if(blockData){
                    const node = VSBlock.createCanvasBlockNode(blockData, DragState.width, DragState.height);
                    node.dataset.sourceId = id;
                    Object.assign(node.style, {
                        left: (e.clientX - canvasRect.left - DragState.offsetX) + "px", 
                        top: (e.clientY - canvasRect.top - DragState.offsetY) + "px"
                    });
                    canvasArea.appendChild(node);
                    requestAnimationFrame(()=>{ VSResult.updateResult(); });
                }
            }

            if(inTrash){
                Conditions.blocks = Conditions.blocks.filter(b => b.id !== id);
                Conditions.refreshColorIndex();
                document.querySelectorAll(`[data-source-id="${id}"]`).forEach(node => node.remove());
                VSBlockList.refreshBlockList();
                VSBlock.refreshCanvasBlockColors();
            }

            VSResult.updateResult();
            preview.remove();

            DragState.previewNode = null;
            DragState.blockId = null;
        });
    }
}

class VSOpenButtonController{
    static bind(openButton, overlay){
        openButton.addEventListener("click", () => {
            overlay.style.display = "flex";

            requestAnimationFrame(() => {
                const canvas = document.getElementById("canvas-canvas");
                const drawCanvas = document.getElementById("draw-layer");

                drawCanvas.width = canvas.clientWidth;
                drawCanvas.height = canvas.clientHeight;

                VSCanvas.redrawLoops();
            });
        });
    }
}

class VSClearButtonController{
    static bind(button){
        button.addEventListener("click", ()=>{
            CanvasState.loops = [];
            document
                .querySelectorAll("#canvas-canvas [data-source-id]")
                .forEach(node=>node.remove());
            VSCanvas.redrawLoops();
            VSResult.updateResult();
        });
    }
}

class VSEraserButtonController{
    static bind(eraserButton){
        eraserButton.addEventListener("click", () => {
            CanvasState.isEraserMode = !CanvasState.isEraserMode;

            eraserButton.textContent = CanvasState.isEraserMode ? "消しゴムモード終了" : "消しゴムモード";
            const clearButton = document.getElementById("clear-button");
            if(clearButton){
                clearButton.style.display = CanvasState.isEraserMode ? "inline-block" : "none";
            }
        });
    }
}

class VSInputBoxController{
    static bind(inputBox){
        inputBox.addEventListener("keydown", (e) => { 
            if(e.key === "Enter"){
                e.preventDefault();
                VSBlockList.addBlock(); 
            }
        });
    }
}

class VSAddButtonController{
    static bind(addButton){
        addButton.addEventListener("click", VSBlockList.addBlock);
    }
}

class VSTrashAreaController{
    static bind(trashArea){
        trashArea.addEventListener("dragover", (e) => e.preventDefault() );
        trashArea.addEventListener("drop", (e) => {
            e.preventDefault();

            const id = Number(e.dataTransfer.getData("text/plain"));

            Conditions.blocks = Conditions.blocks.filter(b => b.id !== id);
            Conditions.refreshColorIndex();

            VSBlockList.refreshBlockList();
            VSBlock.refreshCanvasBlockColors();
        });
    }
}

class VSCloseButtonController{
    static bind(overlay, closeButton){
        closeButton.addEventListener("click", () => {
            overlay.style.display = "none";
        });
        overlay.addEventListener("click", (e) => {
            if(e.target === overlay){
                overlay.style.display = "none";
            }
        });
    }
}

class VSConfirmButtonController{
    static bind(targetInput, overlay){
        const resultTextBox = overlay.querySelector("#result-textbox");
        const confirmButton = overlay.querySelector("#vs-confirm");
        confirmButton.addEventListener("click", () => {
            const query = resultTextBox.textContent;
            targetInput.value = (query === "条件文") ? "" : query;
            // アーカイブサイトのリアルタイム検索を即座に発火
            targetInput.dispatchEvent(new Event("input", { bubbles: true }));
            overlay.style.display = "none";
        });
    }
}

class VSBlockController{
    static bind(node, blockData){
        node.addEventListener("mousedown", (e) => {
            DragState.width = node.getBoundingClientRect().width;
            DragState.height = node.getBoundingClientRect().height;
            DragState.offsetX = e.clientX - node.getBoundingClientRect().left;
            DragState.offsetY = e.clientY - node.getBoundingClientRect().top;

            e.preventDefault();
            DragState.blockId = blockData.id;

            const preview = VSBlock.createDraggingPreviewNode(blockData);
            Object.assign(preview.style, {
                left: e.pageX + "px", 
                top: e.pageY + "px"
            });
            document.body.appendChild(preview);

            DragState.previewNode = preview;
        });
    }
}

class VSCanvasBlockController{
    static bind(node, blockData){
        VSCanvasBlockController.dragOrClick(node, blockData);
        VSCanvasBlockController.resize(node);
    }

    static dragOrClick(node, blockData){
        node.addEventListener("mousedown", (e) => {
            if(e.button !== 0) return;
            e.stopPropagation();
            e.preventDefault();

            const startMouseX = e.clientX;
            const startMouseY = e.clientY;
            const startLeft = parseFloat(node.style.left || "0");
            const startTop  = parseFloat(node.style.top  || "0");

            const originalLeft = startLeft;
            const originalTop = startTop;

            let moved = false;

            function mouseMove(ev){
                const dx = ev.clientX - startMouseX;
                const dy = ev.clientY - startMouseY;

                if(Math.abs(dx) > 5 || Math.abs(dy) > 5){
                    moved = true;
                }

                if(!moved) return;

                Object.assign(node.style, {
                    left: (startLeft + dx) + "px", 
                    top: (startTop + dy) + "px"
                });
            }

            function mouseUp(ev){
                document.removeEventListener("mousemove", mouseMove);
                document.removeEventListener("mouseup", mouseUp);

                if(!moved){
                    const isNot = node.dataset.isNot === "true";
                    node.dataset.isNot = (!isNot).toString();
                    VSResult.updateResult();

                    if(node.dataset.isNot === "true"){
                        Object.assign(node.style, {
                            background: VSStyle.colors.blocks.negBlock, 
                            color: "white"
                        });
                    }else{
                        Object.assign(node.style, {
                            background: VSStyle.colors.block[blockData.colorIndex], 
                            color: "black"
                        });
                    }
                    return;
                }

                const canvas = document.getElementById("canvas-canvas");
                const canvasRect = canvas.getBoundingClientRect();

                const trash = document.getElementById("trash-area");
                const trashRect = trash.getBoundingClientRect();

                const inCanvas = ev.clientX >= canvasRect.left && ev.clientX <= canvasRect.right
                              && ev.clientY >= canvasRect.top  && ev.clientY <= canvasRect.bottom;
                const inTrash  = ev.clientX >= trashRect.left  && ev.clientX <= trashRect.right
                              && ev.clientY >= trashRect.top   && ev.clientY <= trashRect.bottom;
                
                if( inTrash ){
                    node.remove();
                }else if(!inCanvas){
                    Object.assign(node.style, {
                        left: originalLeft + "px",
                        top: originalTop  + "px"
                    });
                }
                VSResult.updateResult();
            }

            document.addEventListener("mousemove", mouseMove);
            document.addEventListener("mouseup", mouseUp);
        });
    }

    static resize(parent){
        const resizeHandle = document.createElement("div");
        Object.assign(resizeHandle.style, {
            position: "absolute", 
            right: "0", 
            bottom: "0", 
            width: "12px", 
            height: "12px", 
            clipPath: "polygon(100% 0%, 100% 100%, 0% 100%, 0% 75%, 75% 0%)", 
            background: VSStyle.colors.blocks.resizeHandle,
            cursor: "nwse-resize",
            zIndex:"100"
        });
        resizeHandle.addEventListener("mousedown", (e) => {
            e.preventDefault();
            e.stopPropagation();

            const startX = e.clientX;
            const startY = e.clientY;
            const startWidth = parent.offsetWidth;
            const startHeight = parent.offsetHeight;

            function move(ev){
                Object.assign(parent.style, {
                    width: Math.max(50, startWidth  + (ev.clientX - startX)) + "px", 
                    height: Math.max(30, startHeight + (ev.clientY - startY)) + "px"
                });
            }
            function up(){
                document.removeEventListener("mousemove", move);
                document.removeEventListener("mouseup", up);
            }
            document.addEventListener("mousemove", move);
            document.addEventListener("mouseup", up);
        });
        parent.appendChild(resizeHandle);
    }
}
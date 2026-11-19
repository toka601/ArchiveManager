class VSCanvas{
    /**
     * キャンバスのノード生成
     * @returns {HTMLElement}
     */
    static render(){
        const area = document.createElement("div");
        area.id = "canvas-area";
        Object.assign(area.style, {
            border: "1px solid rgba(0, 0, 0, 1)", 
            borderRadius: "10px",
            position: "relative", 
            flex: "1",
            minHeight: "220px",
            padding: "10px", 
            paddingTop: "5px"
        });

        const header = document.createElement("div");
        header.id = "canvas-header";
        header.textContent = "キャンバス";
        header.style.fontWeight = "600";
        area.appendChild(header);

        const canvas = document.createElement("div");
        canvas.id = "canvas-canvas";
        Object.assign(canvas.style, {
            background: VSStyle.colors.canvas.canvas,
            position: "absolute", 
            left: "10px", 
            right: "10px", 
            top: "30px", 
            bottom: "10px",
            borderRadius: "6px",
            overflow: "hidden"
        });

        const tips = document.createElement("div");
        tips.id = "canvas-tips";
        tips.textContent =    "囲ったもの = または（論理和）";
        tips.textContent += "\n囲っていないもの = かつ（論理積）";
        tips.textContent += "\n黒いもの = ではない（否定）";
        Object.assign(tips.style, {
            background: VSStyle.colors.canvas.tips, 
            border: "1px solid rgba(0, 0, 0, 0.5)", 
            borderRadius: "10px", 
            fontSize: "10px", 
            whiteSpace: "pre-wrap", 
            position: "absolute", 
            right: "10px", 
            bottom: "10px", 
            display: "inline-block",
            padding: "5px",
            pointerEvents: "none"
        });
        canvas.appendChild(tips);

        // 描画レイヤー
        const drawCanvas = document.createElement("canvas");
        drawCanvas.id = "draw-layer";
        Object.assign(drawCanvas.style, {
            position: "absolute", 
            left: "0", 
            top: "0", 
            zIndex: "1", 
            pointerEvents: "none"
        });
        canvas.appendChild(drawCanvas);

        requestAnimationFrame(()=>{
            drawCanvas.width = canvas.clientWidth;
            drawCanvas.height = canvas.clientHeight;
            VSCanvas.redrawLoops();
        });

        VSCanvasController.bind(canvas, drawCanvas);
            
        area.appendChild(canvas);

        return area;
    }

    // 線再描画
    static redrawLoops(tempLoop = null){
        const canvas = document.getElementById("draw-layer");
        if(!canvas) return;

        const ctx = canvas.getContext("2d");
        ctx.clearRect( 0, 0, canvas.width, canvas.height );

        ctx.lineWidth = 2;
        ctx.strokeStyle = "rgba(0,0,0,0.8)";

        for(const loop of CanvasState.loops){
            if(loop.points.length < 2) continue;

            ctx.beginPath();
            ctx.moveTo( loop.points[0].x, loop.points[0].y );
            for(let i=1;i<loop.points.length;i++){
                ctx.lineTo( loop.points[i].x, loop.points[i].y );
            }
            ctx.stroke();
        }

        if(tempLoop && tempLoop.points.length >= 2){
            ctx.strokeStyle = CanvasState.isEraserMode ? "rgba(239, 68, 68, 0.85)" : "rgba(0,0,0,0.8)";
            ctx.beginPath();
            ctx.moveTo( tempLoop.points[0].x, tempLoop.points[0].y );
            for(let i=1;i<tempLoop.points.length;i++){
                ctx.lineTo( tempLoop.points[i].x, tempLoop.points[i].y );
            }
            ctx.stroke();
        }
    }

    // 囲み判定
    static isInsidePolygon(point, polygon){
        let inside = false;

        for(let i=0,j=polygon.length-1; i<polygon.length; j=i++){
            const xi = polygon[i].x;
            const yi = polygon[i].y;
            const xj = polygon[j].x;
            const yj = polygon[j].y;

            const intersect = ((yi > point.y)!=(yj > point.y)) && (point.x < (xj-xi)*(point.y-yi)/(yj-yi)+xi );
            if(intersect) inside = !inside;
        }

        return inside;
    }

    // 消しゴム交差判定
    static lineSegmentsIntersect(a,b,c,d){
        const ccw = (p1,p2,p3)=>{
            return (p3.y-p1.y)*(p2.x-p1.x)
                > (p2.y-p1.y)*(p3.x-p1.x);
        };

        return (
            ccw(a,c,d) !== ccw(b,c,d) &&
            ccw(a,b,c) !== ccw(a,b,d)
        );
    }

    static findIntersectLoops(pathPoints){
        const hits = [];

        for( let loopIndex=0; loopIndex<CanvasState.loops.length; loopIndex++ ){
            const loop = CanvasState.loops[loopIndex];
            let intersected = false;

            for(let i=1;i<pathPoints.length;i++){
                const a = pathPoints[i-1];
                const b = pathPoints[i];

                for(let j=1;j<loop.points.length;j++){
                    const c = loop.points[j-1];
                    const d = loop.points[j];
                    if( VSCanvas.lineSegmentsIntersect(a,b,c,d) ){
                        intersected = true;
                        break;
                    }
                }
                if(intersected) break;
            }
            if(intersected) hits.push(loopIndex);
        }
        return hits;
    }

    // ブロック中心座標取得
    static getCanvasBlocks(){
        const canvas = document.getElementById("canvas-canvas");
        if(!canvas) return [];

        return [...canvas.children]
            .filter(n=>n.dataset.sourceId)
            .map(node=>{
                return{
                    node,
                    id:Number(node.dataset.sourceId),
                    isNot:node.dataset.isNot === "true",
                    x:node.offsetLeft + node.offsetWidth/2,
                    y:node.offsetTop + node.offsetHeight/2
                };
            });
    }
}
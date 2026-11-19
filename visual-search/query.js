class VSQueryBuilder{
    // 論理式生成
    static buildQuery(){
        const groups = VSQueryBuilder.buildGroups();
        const used = new Set();
        const andExpressions = [];

        // 囲んだもの → ORグループ
        for(const group of groups){
            const terms = [];

            for(const item of group){
                used.add(item.id);

                const source = Conditions.blocks.find( b => b.id === item.id );
                if(!source) continue;

                terms.push(
                    item.isNot 
                        ? "-" + source.text 
                        : source.text
                );
            }

            if(terms.length){
                andExpressions.push( "( " + terms.join(" OR ") + " )" );
            }
        }

        // 囲んでいないもの → AND
        const allBlocks = VSCanvas.getCanvasBlocks();

        for(const block of allBlocks){
            if(used.has(block.id)) continue;

            const source = Conditions.blocks.find(
                b => b.id === block.id
            );
            if(!source) continue;

            andExpressions.push(
                block.isNot
                    ? "-" + source.text
                    : source.text
            );
        }

        // 全体を AND（スペース区切り）
        return andExpressions.join(" ");
    }

    // 囲みグループ生成
    static buildGroups(){
        const blocks = VSCanvas.getCanvasBlocks();
        const groups = [];
        for(const loop of CanvasState.loops){
            const members = [];
            for(const block of blocks){
                if( VSCanvas.isInsidePolygon({x:block.x,y:block.y}, loop.points) ){
                    members.push(block);
                }
            }
            if(members.length) groups.push(members);
        }

        return groups;
    }
}
/**
 * 検索ワード(条件)に関する情報
 */
class Condition{
    /**
     * @param {number} id - 当てられた種族ID
     * @param {String} text - 検索ワード
     * @param {number} colorIndex - ブロックの配色
     */
    constructor(id, text, colorIndex){
        this.id = id;
        this.text = text;
        this.colorIndex = colorIndex;
    }
}

class DrawLoop{
    constructor(){
        this.points = [];
    }
}

/**
 * Conditionの保持を行う
 */
class Conditions{
    /** @type {Condition[]} */
    static blocks = [];
    /** @type {number} */
    static nextId = 1;

    static clear(){
        Conditions.blocks = [];
        Conditions.nextId = 1;
    }

    /**
     * 検索ワード追加
     * @param {String} text
     */
    static add(text){
        text = text.trim();
        if(text && Conditions.blocks.length < VSStyle.colors.block.length){
            Conditions.blocks.push(new Condition(Conditions.nextId++, text, Conditions.blocks.length));
        }
    }

    static refreshColorIndex(){
        Conditions.blocks.forEach((block, index) => { block.colorIndex = index; });
    }
}

class DragState{
    static blockId = null;
    static previewNode = null;
    static width = 0;
    static height = 0;
    static offsetX = 0;
    static offsetY = 0;
}

class CanvasState{
    static loops = [];
    static isEraserMode = false;
}
class Searcher {
    // ワードかどうか
    static isOperand = t => !(["OR", "AND", "(", ")"].includes(t));

    /**
     * データベースを検索条件で絞り込む
     * @param {Object[]} database - アーカイブデータの配列
     * @param {String} searchWord - 検索ワード（AND, OR, -除外, () 対応）
     * @param {String} target - 検索対象 ("all" | "title" | "series" | "author" | "tags" | "memo" | "url")
     * @param {String} matchType - 検索方式 ("partial" | "exact" | "prefix" | "suffix" | "regex")
     * @returns {Object[]} 絞り込まれたデータを返す
     */
    static search(database, searchWord = "", target = "all", matchType = "partial") {
        if (!database) return [];
        if (!searchWord || searchWord.trim() === "") return [...database];

        // トークン化
        const tokens = Searcher.tokenize(searchWord);
        if (tokens.length === 0) return [...database];

        // ANDを明示的に補完
        const normalizedTokens = Searcher.insertAnd(tokens);

        // 中置→後置変換（Shunting-yard）
        const postfix = Searcher.toPostfix(normalizedTokens);

        // データを評価
        return database.filter(data => {
            return Searcher.evaluate(postfix, data, target, matchType);
        });
    }

    // トークン化
    static tokenize(text) {
        const tokens = [];

        // () OR - 単語を抽出
        const regex = /\(|\)|OR|-?[^\s()]+/g;

        let match;
        while ((match = regex.exec(text)) !== null) {
            tokens.push(match[0]);
        }

        return tokens;
    }

    static insertAnd(tokens) {
        const result = [];

        for (let i = 0; i < tokens.length; i++) {
            const current = tokens[i];
            result.push(current);

            const next = tokens[i + 1];
            if (!next) continue;

            // ANDを省略したケースを補完
            if (
                (Searcher.isOperand(current) || current === ")") &&
                (Searcher.isOperand(next) || next === "(")
            ) {
                result.push("AND");
            }
        }

        return result;
    }

    static toPostfix(tokens) {
        const output = [];
        const operators = [];
        const priority = { "OR": 1, "AND": 2 };

        for (const token of tokens) {
            if (Searcher.isOperand(token)) {
                output.push(token);
            } else if (token === "(") {
                operators.push(token);
            } else if (token === ")") {
                while (operators.length && operators[operators.length - 1] !== "(") {
                    output.push(operators.pop());
                }
                operators.pop();
            } else {
                while (
                    operators.length &&
                    operators[operators.length - 1] !== "(" &&
                    priority[operators[operators.length - 1]] >= priority[token]
                ) {
                    output.push(operators.pop());
                }
                operators.push(token);
            }
        }

        while (operators.length) {
            output.push(operators.pop());
        }

        return output;
    }

    /**
     * 単一の値（または配列）に対して検索方式ごとの一致判定を行う
     * @param {String|String[]} fieldValue
     * @param {String} word
     * @param {String} matchType
     * @returns {Boolean}
     */
    static matchValue(fieldValue, word, matchType) {
        if (fieldValue === undefined || fieldValue === null) return false;

        // タグなどの配列フィールドの場合、いずれかの要素が条件を満たせばtrue
        if (Array.isArray(fieldValue)) {
            return fieldValue.some(item => Searcher.matchValue(item, word, matchType));
        }

        const rawText = String(fieldValue);
        const text = rawText.toLowerCase();
        const query = word.toLowerCase();

        switch (matchType) {
            case "exact":
                // 完全一致
                return text === query;
            case "prefix":
                // 前方一致
                return text.startsWith(query);
            case "suffix":
                // 後方一致
                return text.endsWith(query);
            case "regex":
                // 正規表現（大文字小文字区別なし）
                try {
                    const reg = new RegExp(word, "i");
                    return reg.test(rawText);
                } catch (e) {
                    return false;
                }
            case "partial":
            default:
                // 部分一致
                return text.includes(query);
        }
    }

    /**
     * 検索対象フィールドを取得してワードと照合する
     */
    static checkTargetMatch(data, word, target, matchType) {
        if (target === "all") {
            const searchableKeys = ["title", "series", "author", "tags", "memo", "url"];
            return searchableKeys.some(key => Searcher.matchValue(data[key], word, matchType));
        }
        return Searcher.matchValue(data[target], word, matchType);
    }

    static evaluate(postfix, data, target, matchType) {
        const stack = [];

        for (const token of postfix) {
            if (token === "AND") {
                const b = stack.pop();
                const a = stack.pop();
                stack.push(Boolean(a && b));
            } else if (token === "OR") {
                const b = stack.pop();
                const a = stack.pop();
                stack.push(Boolean(a || b));
            } else {
                let isNot = false;
                let word = token;

                if (token.startsWith("-") && token.length > 1) {
                    isNot = true;
                    word = token.substring(1);
                }

                const found = Searcher.checkTargetMatch(data, word, target, matchType);
                stack.push(isNot ? !found : found);
            }
        }

        return Boolean(stack.pop());
    }
}
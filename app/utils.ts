class Utils {
    public static countCapitals(text: string): number {
        let capitals = 0;
        for (const c of text) {
            if (parseInt(c).toString() !== c && c === c.toUpperCase() && c !== c.toLowerCase()) {
                capitals++;
            }
        }

        return capitals;
    }

    public static countLetters(text: string): number {
        let letters = 0;
        for (const c of text) {
            if (Utils.isLetter(c)) {
                letters++;
            }
        }

        return letters;
    }

    public static isLetter(text) {
         return /[A-z]/.test(text);
    }
}

export default Utils;

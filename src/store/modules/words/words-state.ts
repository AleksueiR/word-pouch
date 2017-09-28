export class Word {
    constructor(
        public text: string,
        public archived: boolean = false,
        public noteId: string = '') {}

    get JSON() {
        return {
            text: this.text,
            archived: this.archived,
            noteId: this.noteId
        };
    }
}

export interface WordsState {
    items: Word[]
};
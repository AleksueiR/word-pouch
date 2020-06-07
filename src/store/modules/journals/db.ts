import Dexie from 'dexie';

Dexie.delete('word-pouch');

// pack, deck, collection, list, trove, stash, lexicon, dictionary, wordstock, diction, journal, binder

// base, hub, site,

// lexicon
// journal/bundle/section?/story/branch?/bough
// word

// journals/groups/words

export class WordPouch extends Dexie {
    // Declare implicit table properties.
    // (just to inform Typescript. Instantiated by Dexie in stores() method)
    journals: Dexie.Table<Journal, number>; // number = type of the primary key
    groups: Dexie.Table<Group, number>;
    words: Dexie.Table<Word, number>;

    // NOTE: maybe it will be worth to use many-to-many junction for words-in-group as described here: https://github.com/dfahlander/Dexie.js/issues/815

    constructor() {
        super('word-pouch');
        this.version(1).stores({
            // A compound index cannot be marked MultiEntry. The limitation lies within indexedDB itself. :/
            journals: '++id, name, rootGroupId',
            groups: '++id, journalId, name, displayMode, *subGroupIds',
            words: '++id, journalId, text, isArchived, *memberGroupIds'
        });

        this.journals.mapToClass(Journal);
        this.journals.mapToClass(Group);
        this.journals.mapToClass(Word);
    }
}

export class Journal {
    readonly id: number;

    constructor(
        public name: string = 'Default Journal',
        public rootGroupId: number = -1,
        public defaultGroupId: number = -1
    ) {}
}

export class Group {
    readonly id: number;

    constructor(
        public name: string,
        public journalId: number,
        public displayMode: GroupDisplayMode = GroupDisplayMode.all,
        public subGroupIds: number[] = []
    ) {}
}

export class Word {
    readonly id: number;

    constructor(
        public text: string,
        public journalId: number,
        public memberGroupIds: number[] = [],
        public isArchived: boolean = false
    ) {}
}

export enum GroupDisplayMode {
    all = 0,
    active = 1,
    archived = 2
}

const db = new WordPouch();

export default db;

db.on('populate', async () => {
    const journalId = await db.journals.add(new Journal('Default Journal'));

    const rootGroupId = await db.groups.add(new Group('Root group', journalId));
    await db.journals.update(journalId, { rootGroupId: rootGroupId });

    const groupIds = await db.groups.bulkAdd(
        [
            new Group('list one', journalId),
            new Group('list two', journalId, GroupDisplayMode.archived),
            new Group('list three', journalId)
        ],
        { allKeys: true }
    );

    await db.groups.update(rootGroupId, { subGroupIds: groupIds });

    db.words.bulkAdd([
        new Word('foo', journalId, [1, 2]),
        new Word('bar', journalId, [1, 3]),
        new Word('wonder', journalId, [2, 3]),
        new Word('queen', journalId, [1]),
        new Word('king', journalId, [2])
    ]);
});

db.open();

b();

async function b() {
    const a = await db.words
        .where('memberGroupIds')
        .equals(1)
        .toArray();

    // console.log('words', a);

    db.words.get(1).then(async word => {
        const lists = await db.groups
            .where('id')
            .anyOf(word!.memberGroupIds)
            .toArray();
        // console.log('lists', lists);
    });

    // const b = await db.words.orderBy('text').keys();
    const b = await db.words
        .where('text')
        .startsWith('f')
        .keys();
    // console.log('keys', b);

    const c = await db.words.orderBy('text').toArray();
    // console.log(c);

    const d = await db.words
        .filter(word => {
            return word.text === 'foo';
        })
        .toArray();

    // console.log('d', d);

    db.groups.where('subGroupIds').equals(1);
}
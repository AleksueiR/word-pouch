import { db, getResourceSentenceIds, putSentenceInResource, Sentence } from '@/api/db';
import {
    areArraysEqual,
    reduceArrayToObject,
    updateArrayWithValues,
    UpdateMode,
    wrapInArray,
    intersectArrays
} from '@/util';
import { CommonEntryStash, Stash, BaseStashState } from '../internal';
import { CommonEntryStashState } from '../common';

export class SentencesState extends CommonEntryStashState<Sentence> {}

export class SentencesModule extends CommonEntryStash<Sentence, SentencesState> {
    constructor(stash: Stash) {
        super(stash, db.sentences, SentencesState);
    }

    /**
     * Fetch `Sentence`s belonging to the selected `Resource`; if more than one selected, use the first one.
     *
     * @returns {Promise<void>}
     * @memberof SentencesModule
     */
    async fetchResourceSentences(): Promise<void> {
        if (!this.activeJournal) throw new Error('sentences/fetchResourceSentences: Active journal is not set.');

        // use the first selected resource
        const selectedResourceId = this.$stash.resources.selectedIds.shift();
        if (!selectedResourceId) return;

        const sentenceIds = await getResourceSentenceIds(selectedResourceId);
        const sentences = await this.table.bulkGet(sentenceIds);

        this.state.all = reduceArrayToObject(sentences);

        // re-select previously selected sentences
        this.setSelectedIds(intersectArrays(this.selectedIds, this.allIds));
    }

    /**
     * Create new `Sentences`s in the active `Journal`.
     * Return the ids of the new `Sentence`s.
     *
     * @param {(string | string[])} texts
     * @returns {Promise<number[]>}
     * @memberof SentencesModule
     */
    async new(texts: string | string[]): Promise<number[]> {
        const activeJournalId = this.activeJournal?.id;
        if (!activeJournalId) throw new Error('sentences/new: Active journal is not set.');

        const textList = wrapInArray(texts);

        return db.transaction('rw', this.table, db.resources, db.sentencesInResources, async () => {
            const newSentenceIds = await this.table.bulkAdd(
                textList.map(text => new Sentence(text, activeJournalId)),
                { allKeys: true }
            );

            const newSentences = await this.table.bulkGet(newSentenceIds);
            if (newSentences.length !== textList.length) throw new Error('sentences/new: Cannot create new Sentences.');

            return newSentenceIds;
        });
    }

    /**
     * Delete specified `Sentence`s from the active `Journal`.
     *
     * @param {(number | number[])} sentenceIds
     * @returns {Promise<void>}
     * @memberof SentencesModule
     */
    async delete(sentenceIds: number | number[]): Promise<void> {
        const sentenceIdList = wrapInArray(sentenceIds);
        sentenceIdList.forEach(sentenceId => {
            if (!this.isValidInDb(sentenceId))
                throw new Error(`sentences/delete: Sentence #${sentenceId} is not valid in the active Journal.`);
        });

        await db.transaction('rw', this.table, db.sentencesInResources, async () => {
            // delete sentences from the db
            this.table.bulkDelete(sentenceIdList);

            // delete sentence-resource links
            await db.sentencesInResources
                .where('sentenceId')
                .anyOf(sentenceIdList)
                .delete();
        });

        // adjust selected ids
        await this.setSelectedIds(sentenceIdList, UpdateMode.Remove);

        // re-fetch sentences in case some were deleted from the selected source
        await this.fetchResourceSentences();
    }

    /**
     * Put provided `Sentence`s into the supplied `Resource`.
     *
     * @param {number[]} sentenceIds
     * @param {number} resourceId
     * @returns {Promise<void>}
     * @memberof SentencesModule
     */
    async putSentencesInResource(sentenceIds: number[], resourceId: number): Promise<void> {
        const activeJournalId = this.activeJournal?.id;
        if (!activeJournalId) throw new Error('sentences/putSentencesInResource: Active journal is not set.');

        await db.transaction('rw', this.table, db.resources, db.sentencesInResources, async () => {
            return Promise.all(
                sentenceIds.map(async sentenceId => putSentenceInResource(sentenceId, resourceId, activeJournalId))
            );
        });
    }
}

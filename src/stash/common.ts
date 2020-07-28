import { DBCommonEntry, DBEntry, isValidDBCommonEntry, Journal } from '@/api/db';
import { Table } from 'dexie';
import log from 'loglevel';
import { Stash } from './internal';
import { UpdateMode, wrapInArray, updateArrayWithValues, areArraysEqual } from '@/util';

export type EntrySet<K> = Record<number, K>;

/**
 * Represents a state object of the stash module.
 *
 * @export
 * @class StashModuleState
 * @template K entry class
 */
export class BaseStashState<K> {
    all: EntrySet<K> = {};
}

/**
 * A state constructor to create an empty state.
 *
 * @export
 * @interface StateClass
 * @template K
 * @template T
 */
export interface StashStateClass<K, T extends BaseStashState<K>> {
    new (): T;
}

/**
 *
 *
 * @export
 * @class BaseStashModule
 * @template K
 * @template T
 */
export class BaseStash<K, T extends BaseStashState<K>> {
    /**
     * A reference to the Stash root object.
     *
     * @protected
     * @type {Stash}
     * @memberof BaseStashModule
     */
    protected readonly $stash: Stash;

    /**
     * Module state object.
     *
     * @protected
     * @type {T}
     * @memberof BaseStashModule
     */
    protected readonly state: T;

    /**
     * State Class constructor.
     *
     * @private
     * @type {StashStateClass<K, T>}
     * @memberof BaseStashModule
     */
    private readonly StateClass: StashStateClass<K, T>;

    constructor(stash: Stash, StateClass: StashStateClass<K, T>) {
        const map = { $stash: stash, StateClass };

        // mark $stash as not enumerable so Vue doesn't make it reactive
        Object.entries(map).forEach(([key, value]) =>
            Object.defineProperty(this, key, {
                value,
                enumerable: false,
                writable: false
            })
        );

        this.state = new StateClass();
    }

    /**
     * Reset the state to its defaults.
     *
     * @memberof StashModule
     */
    reset(): void {
        Object.assign(this.state, new this.StateClass());
    }
}

/**
 * A stash module class providing some default functions.
 *
 * @export
 * @class DBEntryStashModule
 * @extends {BaseStash<K, T>}
 * @template K
 * @template T
 */
export class EntryStash<K extends DBEntry, T extends BaseStashState<K>> extends BaseStash<K, T> {
    /**
     * A reference to the corresponding Dexie table.
     *
     * @protected
     * @type {Table<K, number>}
     * @memberof DBEntryStashModule
     */
    protected readonly table: Table<K, number>;

    constructor(stash: Stash, table: Table, StateClass: StashStateClass<K, T>) {
        super(stash, StateClass);

        // mark `table` as not enumerable so Vue doesn't make it reactive
        Object.defineProperty(this, 'table', {
            value: table,
            enumerable: false,
            writable: false
        });
    }

    /**
     * Return the full entry set.
     *
     * @readonly
     * @type {EntrySet<K>}
     * @memberof StashModule
     */
    get all(): EntrySet<K> {
        return this.state.all;
    }

    protected get allIds(): number[] {
        return Object.keys(this.all).map(k => +k);
    }

    /* protected existInState(id: number): boolean {
        return this.state.all[id] !== undefined;
    } */

    protected addToAll(value: K): void {
        if (this.all[value.id]) throw new Error(`${this.moduleName}/add: Entry ${value.id} already exists.`);

        this.state.all[value.id] = value;
    }

    /* protected putInState(value: K): void {
        this.state.all[value.id] = value;
    }

    protected deleteFromState(value: K | number): void {
        delete this.all[typeof value === 'number' ? value : value.id];
    } */

    /**
     * Get an Entry<K> with the id specified from the state.
     *
     * @param {number} id
     * @returns {(K | undefined)}
     * @memberof StashModule
     */
    get(id: number): K | undefined {
        return this.state.all[id];
    }

    /**
     * Get an Entry<K> with the id specified directly from the db.
     * Throws an error if the id is not valid.
     *
     * @protected
     * @param {number} id
     * @returns {Promise<K>}
     * @memberof StashModule
     */
    protected async getFromDb(id: number): Promise<K | undefined> {
        return this.table.get(id);
    }

    /**
     * Check if the supplied id is valid in the State.
     *
     * @param {number} id
     * @returns {boolean}
     * @memberof StashModule
     */
    isValid(id: number): boolean {
        return this.state.all[id] !== undefined;
    }

    /**
     * Check if the supplied entry id is valid in the DB.
     *
     * @param {number} id
     * @returns {Promise<boolean>}
     * @memberof StashModule
     */
    async isValidInDb(id: number): Promise<boolean> {
        return (await this.table.where({ id }).count()) === 1;
    }

    /**
     * Update a specified record in the entry set and update the corresponding record in the DB.
     * Returns the number of entries updated (1 or 0);
     *
     * @protected
     * @template T
     * @template S
     * @param {number} id
     * @param {T} key
     * @param {(S | ((entry: K) => S))} payload
     * @returns {Promise<number>}
     * @memberof StashModule
     */
    protected async updateStateAndDb<T extends keyof Omit<K, 'id'>, S extends K[T]>(
        id: number,
        key: T,
        payload: S | ((entry: K) => S)
    ): Promise<number> {
        // if payload is a function, use it to get a value
        // if payload is value, wrap a function around it to return the payload value
        const getValue = payload instanceof Function ? payload : () => payload;

        return this.table.where({ id }).modify(dbEntry => {
            const stateEntry = this.get(dbEntry.id);
            // the entry might not exist in the state as it wasn't loaded; it's normal
            if (!stateEntry) return;

            const value = getValue(stateEntry);

            if (dbEntry[key] === value)
                return log.info(
                    `${this.moduleName}/updateStateAndDb: Db #${dbEntry.id}.${key} entry already has value ${value}.`
                );

            dbEntry[key] = stateEntry[key] = value;
        });
    }

    /**
     * Return the name of this Stash module.
     *
     * @readonly
     * @protected
     * @type {string}
     * @memberof DBEntryStashModule
     */
    protected get moduleName(): string {
        return this.constructor.name.replace('Module', '').toLowerCase();
    }
}

export class CommonEntryStashState<K> extends BaseStashState<K> {
    selectedIds: number[] = [];
}

export class CommonEntryStash<K extends DBCommonEntry, T extends CommonEntryStashState<K>> extends EntryStash<K, T> {
    // TODO: check if these can be moved to the main class
    /**
     * Return an active journal or throws an error if the active journal is not set or its root group is not set.
     *
     * @readonly
     * @protected
     * @type {Journal}
     * @memberof NonJournalStashModule
     */
    protected get activeJournal(): Journal | null {
        return this.$stash.journals.active;
    }

    protected async getFromDb(id: number): Promise<K | undefined> {
        const entry = await super.getFromDb(id);

        if (!this.activeJournal) throw new Error(`${this.moduleName}/getFromDb: Active journal is not set.`);

        return entry;
    }

    /**
     * Check if the supplied entry id is valid in the DB and belongs to the active journal.
     *
     * @param {number} id
     * @returns {Promise<boolean>}
     * @memberof CommonStashModule
     */
    async isValidInDb(id: number): Promise<boolean> {
        if (!this.activeJournal) throw new Error(`${this.moduleName}/isValidInDb: Active journal is not set.`);

        return isValidDBCommonEntry(this.table, { id, journalId: this.activeJournal.id });
    }

    /**
     * Check if the supplied entry id is valid in the State and belongs to the active journal.
     *
     * @param {number} id
     * @returns {boolean}
     * @memberof CommonStashModule
     */
    isValid(id: number): boolean {
        if (!this.activeJournal) throw new Error(`${this.moduleName}/isValid: Active journal is not set.`);

        const entry = this.get(id);

        return entry !== undefined && entry.journalId === this.activeJournal.id;
    }

    get selectedIds(): number[] {
        return this.state.selectedIds;
    }

    /**
     * Set provided `Entry` ids as selected.
     * Selection mode lets you "add to", "remove from", or "replace" the existing selection list.
     *
     * Return 0 if selected ids do not change.
     *
     * @param {(number | number[])} entryIds
     * @param {*} [updateMode=UpdateMode.Replace]
     * @returns {(Promise<void | 0>)}
     * @memberof CommonEntryStash
     */
    async setSelectedIds(entryIds: number | number[], updateMode = UpdateMode.Replace): Promise<void | 0> {
        const entryIdList = wrapInArray(entryIds);

        entryIdList.forEach(entryId => {
            if (!this.isValid(entryId))
                throw new Error(`${this.moduleName}/setSelectedIds: Entry #${entryId} is not valid.`);
        });

        const newSelectedEntryIds = updateArrayWithValues(this.selectedIds, entryIdList, updateMode);
        if (areArraysEqual(this.state.selectedIds, newSelectedEntryIds)) return 0;

        this.state.selectedIds = newSelectedEntryIds;
    }
}

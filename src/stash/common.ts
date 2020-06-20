import { DBEntry } from '@/api/db';
import { notEmptyFilter } from '@/util';
import { Table } from 'dexie';
import log from 'loglevel';
import { Stash } from './internal';

export type SpecificUpdater<K> = <T extends keyof Omit<K, 'id'>, S extends K[T]>(
    id: number,
    key: T,
    value: S
) => Promise<void | 0>;

export type EntrySet<K> = Record<number, K>;

/**
 * Represents a state object of the stash module.
 *
 * @export
 * @class StashModuleState
 * @template K entry class
 */
export class StashModuleState<K> {
    all: EntrySet<K> = {};
}

/**
 * A state constructor to create an empty state.
 *
 * @export
 * @interface IStashModuleStateClass
 * @template K
 * @template T
 */
export interface StashModuleStateClass<K, T extends StashModuleState<K>> {
    new (): T;
}

/**
 * A stash module class providing some default functions.
 *
 * @export
 * @class StashModule
 * @template K entry class
 * @template T state class
 */
export class StashModule<K extends DBEntry, T extends StashModuleState<K>> {
    protected readonly $stash: Stash;

    protected readonly table: Table<K, number>;
    protected readonly state: T;

    private readonly StateClass: StashModuleStateClass<K, T>;

    constructor(stash: Stash, table: Table, StateClass: StashModuleStateClass<K, T>) {
        const map = { $stash: stash, table, StateClass };

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
     * Return the full entry set.
     *
     * @readonly
     * @type {EntrySet<K>}
     * @memberof StashModule
     */
    get all(): EntrySet<K> {
        return this.state.all;
    }

    /**
     * Set a collection of all entries.
     *
     * @protected
     * @param {EntrySet<K>} value
     * @memberof StashModule
     */
    protected setAll(value: EntrySet<K>): void {
        this.state.all = value;
    }

    /**
     * Add the provided value to the `state.all` set.
     * Return 0 on failure.
     *
     * @protected
     * @param {K} value
     * @returns {(void | 0)}
     * @memberof StashModule
     */
    protected addToAll(value: K): void | 0 {
        if (this.all[value.id]) return log.info(`record/addToAll: Entry ${value.id} already exists.`), 0;

        this.setAll({ ...this.all, ...{ [value.id]: value } });
    }

    /**
     * Remove the provided value from the `state.all` set.
     *
     * @protected
     * @param {K} value
     * @memberof StashModule
     */
    protected removeFromAll(value: K): void {
        delete this.all[value.id];
    }

    /**
     * Get an Entry with the id specified directly from the db.
     * Throws an error if the id is not valid.
     *
     * @protected
     * @param {number} id
     * @returns {Promise<K>}
     * @memberof StashModule
     */
    protected async getFromDb(id: number): Promise<K | undefined> {
        const record = await this.table.get(id);
        if (!record) log.warn(`record/getFromDb: Cannot load or record ${id} doesn't exist.`);

        return record;
    }

    /**
     * Get an Entry (or a list of Entries) with the id specified from the state.
     * Throws an error if the id is not valid.
     *
     * @param {number} id
     * @returns {K | undefined}
     * @memberof StashModule
     */
    get(id: number): K | undefined;
    get(ids: number[]): K[];
    get(value: number | number[]): K | undefined | K[] {
        if (Array.isArray(value)) {
            return value.map(id => this.get(id)).filter(notEmptyFilter);
        }

        const entry = this.state.all[value];
        if (!entry) log.warn(`record/get: Cannot load or record ${value} doesn't exist.`);

        return this.state.all[value];
    }

    /**
     * Vet a list of supplied ids against the loaded entries.
     *
     * @protected
     * @param {number[]} [ids]
     * @returns {number[]}
     * @memberof StashModule
     */
    protected vetIds(ids?: number[]): number[] {
        // get all ids
        const allIds = Object.keys(this.all).map(k => +k);

        // either filter the the provided list to make sure there are no phony ids or return all of them if `ids` is not provided.
        return ids ? allIds.filter(id => ids.includes(id)) : allIds;
    }

    /**
     * Update a specified record in the entry set and update the corresponding record in the db.
     *
     * @param {*} id
     * @param {*} key
     * @param {*} value
     * @returns {Promise<void>}
     */
    updateStateAndDb: SpecificUpdater<K> = async (id, key, value) => {
        const entry = this.get(id);
        if (!entry) return 0;

        // value is already set
        if (entry[key] === value) {
            return log.info(`record/updateStateAndDb: ${id}.${key} already has value ${value}`), 0;
        }

        // set the value in the state
        entry[key] = value;

        // update the db
        return this.table.update(id, { [key]: value }).then(result => {
            // if result === 0, either the id is wrong or the value is already set
            if (result === 0) {
                log.error(`${id} failed to update db: id doesn't exist or value is already set`);

                return 0;
            }
        });
    };

    /**
     * Reset the state to its defaults.
     *
     * @memberof StashModule
     */
    reset(): void {
        Object.assign(this.state, new this.StateClass());
    }
}

//
/* export type AbstractUpdater<K = any> = <T extends keyof Omit<K, 'id'>, S extends K[T]>(
    id: number, key: T, value: S, all?: Record<number, K> ) => void; */

/* export type GenericUpdater = <T extends keyof Omit<K, 'id'>, S extends K[T], K>(
    all: Record<number, K>,
    table: Table,
    id: number,
    key: T,
    value: S
) => Promise<void>; */

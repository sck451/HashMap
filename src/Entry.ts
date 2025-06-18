import type { HashMap } from "./HashMap.ts";
import type { Option } from "@sck/optres";

/**
 * A live window into a {@link HashMap}
 *
 * @typeParam K The type of keys in the `HashMap`
 * @typeParam T The type of the values in the `HashMap`
 */
export class Entry<K, T> {
  #map: HashMap<K, T>;
  #key: K;

  /**
   * Create a new Entry that looks into a `HashMap`. It is normally created using
   * {@link HashMap#entry} but could be instantiated separately: it would work
   * just fine.
   *
   * @example
   * ```ts
   * const hashmap = new HashMap<string, number>();
   * const entry = new Entry("https://example.com", hashmap);
   * entry.insertEntry(1); // inserts value into HashMap
   * entry.get(); // Some(1)
   * ```
   */
  constructor(map: HashMap<K, T>, key: K) {
    this.#map = map;
    this.#key = key;
  }

  /**
   * Sets a value in the `HashMap`
   */
  private set(value: T): void {
    this.#map.set(this.#key, value);
  }

  /**
   * Determine if the entry in the `HashMap` is occupied with a value.
   * @returns `true` if the entry exists in the `HashMap`, otherwise `false`.
   */
  isOccupied(): boolean {
    return this.#map.get(this.#key).isSome();
  }

  /**
   * If the entry exists in the `HashMap`, call `fn` with the current value of
   * the entry, and update that value with the return value of the callback.
   * @param fn A callback function that takes the current value of the entry
   * and sets a new one.
   * @returns the `Entry` object for fluent chaining
   */
  andModify(fn: (value: T) => T): typeof this {
    this.get().inspect((value) => this.set(fn(value)));

    return this;
  }

  /**
   * Inserts the entry into the `HashMap`, replacing the current value if it
   * exists.
   * @param value The new value to set
   * @returns the `Entry` object for fluent chaining
   */
  insertEntry(value: T): typeof this {
    this.set(value);
    return this;
  }

  /**
   * Get the key associated with this `Entry` object
   * @returns the key value
   */
  key(): K {
    return this.#key;
  }

  /**
   * If the entry doesn't exist in the `HashMap`, insert `value`. Otherwise, do
   * nothing.
   * @param value The value to insert if the `Entry` is empty.
   * @returns the `Entry` object for fluent chaining.
   */
  orInsert(value: T): typeof this {
    this.get().match({
      Some: () => {},
      None: () => this.set(value),
    });

    return this;
  }

  /**
   * If the entry doesn't exist in the `HashMap`, run the function and insert the
   * entry into the `HashMap` with the return value. Otherwise, do nothing.
   * @param fn A function that takes the key of the `Entry` and returns a value
   * to insert into the `HashMap`.
   * @returns the `Entry` object for fluent chaining.
   */
  orInsertWith(fn: (key: K) => T): typeof this {
    this.get().match({
      Some: () => {},
      None: () => this.set(fn(this.#key)),
    });

    return this;
  }

  /**
   * Get the value of the `Entry`.
   * @returns `Some(val)` if the entry exists, otherwise `None()`.
   */
  get(): Option<T> {
    return this.#map.get(this.#key);
  }

  /**
   * Insert a new entry into the HashMap, getting the old value if it exists.
   * @param value The new value to insert
   * @returns `Some(val)` if the entry existed already, otherwise `None()`.
   */
  insert(value: T): Option<T> {
    const oldValue = this.get();

    this.set(value);

    return oldValue;
  }

  /**
   * Remove the entry from the `HashMap` and get the value if it existed.
   * @returns `Some(val)` if the entry existed, otherwise `None()`.
   */
  remove(): Option<T> {
    return this.get().map((oldVal) => {
      this.#map.remove(this.#key);
      return oldVal;
    });
  }

  /**
   * Remove the entry from the `HashMap` and get a tuple of the key and value
   * if it was previously set.
   * @returns `Some(key, val)` if the entry existed, otherwise `None()`.
   */
  removeEntry(): Option<[K, T]> {
    return this.get().map((value) => {
      this.#map.remove(this.#key);
      return [this.#key, value];
    });
  }
}

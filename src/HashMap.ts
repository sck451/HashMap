import { none, type Option, some } from "@sck/optres";
import { Entry } from "./Entry.ts";

type Bucket<K, T> = [K, T][];

/**
 * An object that determines whether a key already exists in the {@link HashMap}.
 *
 * Two keys must be provided:
 *
 * - a `hash` method, which takes a key of type `K` and returns a number. The
 * number should be unique for each distinct item.
 * - an `equals` method, which takes two keys as arguments and should return
 * boolean `true` if they should be considered to point to the same entry in
 * the HashMap.
 *
 * @typeParam K The type of the key in the HashMap
 */
export type Hasher<K> = {
  hash: (key: K) => number;
  equals: (key1: K, key2: K) => boolean;
};

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
  }
  return hash;
}

/**
 * The default hashing/equality object. It converts the key to a string and
 * calculates the hash based off that. It then tests whether two keys are
 * equal using [`Object.is`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/is).
 * @returns the default {@link Hasher} object to use in a {@link HashMap}
 */
function defaultHasher<K = unknown>(): Hasher<K> {
  return {
    hash: (key) => {
      return hashString(`${typeof key}: ${key}`);
    },
    equals: (key1, key2) => {
      return Object.is(key1, key2);
    },
  };
}

/**
 * A hashing/equality object that uses a [`WeakMap`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakMap)
 * to check the object.
 * @returns A new {@link Hasher} object to use in a {@link HashMap}.
 */
export function getWeakMapHasher(): Hasher<object> {
  let mapCounter = 0;
  const map = new WeakMap<object, number>();
  return {
    hash: (key) => {
      let hash = map.get(key);
      if (hash === undefined) {
        hash = mapCounter++;
        map.set(key, hash);
      }
      return hash;
    },
    equals: (key1, key2) => {
      const hash1 = map.get(key1);
      if (hash1 === undefined) {
        return false;
      }
      const hash2 = map.get(key2);
      return hash1 === hash2;
    },
  };
}

/**
 * A hybrid hashing/equality object, which will store a hash identifier property
 * on extensible objects, and will fall back to using a
 * [`WeakMap`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakMap)
 * if the object is non-extensible.
 * @returns A new {@link Hasher} object to use in a {@link HashMap}.
 */
export function getHybridHasher(): Hasher<object> {
  let counter = 0;
  const map = new WeakMap<object, number>();
  const HASH_TAG = Symbol("HASH_TAG");

  function isHashTagged(input: unknown): input is { [HASH_TAG]: number } {
    return typeof input === "object" && input !== null &&
      Object.hasOwn(input, HASH_TAG);
  }

  return {
    hash: (key: object) => {
      if (isHashTagged(key)) {
        return key[HASH_TAG];
      }
      if (Object.isExtensible(key)) {
        Object.defineProperty(key, HASH_TAG, {
          value: counter,
          enumerable: false,
          writable: false,
          configurable: false,
        });
        return counter++;
      }
      if (map.has(key)) {
        return map.get(key)!;
      }
      map.set(key, counter);
      return counter++;
    },
    equals: (key1, key2) => {
      if (isHashTagged(key1)) {
        if (isHashTagged(key2)) {
          return key1[HASH_TAG] === key2[HASH_TAG];
        }
        return false;
      }
      if (map.has(key1)) {
        return map.get(key1) === map.get(key2);
      }
      return false;
    },
  };
}

/**
 * A HashMap implementation, which will take arbitrary data and create a fairly
 * efficient storage system, allowing arbitrary access from keys and custom
 * algorithms to support your data types.
 *
 * @example
 * ```ts
 * const hashmap = new HashMap<string, number>();
 * hashmap.add("https://example.com", 4);
 * hashmap.add("https://jsr.io", 2);
 * hashmap.entry("https://example.com").orInsert(0).andModify((val) => val + 1);
 * hashmap.entry("https://deno.com").orInsert(0).andModify((val) => val + 1);
 *
 * hashmap.get("https://example.com"); // Some(5)
 * hashmap.get("https://jsr.io"); // Some(2)
 * hashmap.get("https://deno.com"); // Some(1)
 * hashmap.get("https://deno.land"); // None()
 * ```
 *
 * @typeParam K The key type
 * @typeParam T The value type
 */
export class HashMap<K, T> {
  #buckets: Bucket<K, T>[];
  #count: number = 0;
  readonly #hasher: Hasher<K>;
  /**
   * The threshold at which a resize will be calculated.
   */
  static loadThreshold = 0.75;

  /**
   * Get information about the HashMap.
   * @returns An object that has the following properties:
   *  - `size`: the number of elements in the HashMap
   *  - `capacity`: the capacity the HashMap has to add more items without resizing
   *  - `buckets`: the number of buckets being used
   */
  info(): {
    size: number;
    capacity: number;
    buckets: number;
  } {
    return {
      size: this.size(),
      capacity: this.capacity(),
      buckets: this.buckets(),
    };
  }

  /**
   * Construct a new HashMap. Should normally be called with explicit type parameters,
   * e.g. `new HashMap<string, number>`.
   * @param hasher An object containing `hash` and `equals` methods. This can be a
   * built-in object (such as from {@link defaultHasher}) or a custom one. See
   * {@link Hasher} for more information.
   */
  constructor(hasher?: Hasher<K>) {
    this.#hasher = hasher ?? defaultHasher();
    this.#buckets = Array.from({ length: 8 }, () => []);
  }

  /**
   * Get the number of elements in the HashMap
   * @returns an integer count of elements
   */
  size(): number {
    return this.#count;
  }

  /**
   * Find if the HashMap is empty
   * @returns `true` if there are no elements in the HashMap, otherwise `false`
   */
  isEmpty(): boolean {
    return this.#count === 0;
  }

  /**
   * Get the count of buckets in the HashMap's internal storage. Intended for
   * debugging purposes.
   * @returns the number of buckets in use
   */
  buckets(): number {
    return this.#buckets.length;
  }

  /**
   * Construct a new HashMap from an array of entries (such as is obtained from
   * `Object.entries`).
   *
   * @example
   * ```ts
   * const cache = HashMap.from(Object.entries({"https://example.com": 0})); // constructs a HashMap<string, number>
   * ```
   *
   * @param fromArray An array of tuples, which are key-value pairs to insert
   * into the HashMap
   * @param hasher Optionally, a {@link Hasher} object to calculate equality
   * and hashes
   * @returns A new HashMap
   * @typeParam K The key type for the new HashMap
   * @typeParam T The value type for the new HashMap
   */
  static from<K, T>(fromArray: [K, T][], hasher?: Hasher<K>): HashMap<K, T> {
    const map = HashMap.withCapacity<K, T>(fromArray.length, hasher);

    for (const [key, value] of fromArray) {
      map.set(key, value);
    }

    return map;
  }

  /**
   * Create a new HashMap with a defined capacity and initial size 0
   * @param capacity The number of elements the HashMap should be configured
   * to contain.
   * @param hasher Optionally, a {@link Hasher} object to calculate equality
   * and hashes
   * @returns A new HashMap
   * @typeParam K The key type for the new HashMap
   * @typeParam T The value type for the new HashMap
   */
  static withCapacity<K, T>(
    capacity: number,
    hasher?: Hasher<K>,
  ): HashMap<K, T> {
    const map = new HashMap<K, T>(hasher);

    map.resize(Math.ceil(capacity * HashMap.loadThreshold));

    return map;
  }

  /**
   * Get the bucket that would contain a certain key if it exists
   * @param key The key to find
   * @returns The bucket
   */
  private getBucket(key: K): Bucket<K, T> {
    const hash = this.#hasher.hash(key);
    return this.#buckets[Math.abs(hash) & (this.#buckets.length - 1)]!;
  }

  /**
   * Set a value in the HashMap
   * @param key The new key to insert
   * @param value The new value to insert
   */
  set(key: K, value: T): void {
    const bucket = this.getBucket(key);

    for (let i = 0; i < bucket.length; i++) {
      const [k] = bucket[i]!;
      if (this.#hasher.equals(key, k)) {
        bucket[i]![1] = value;

        return;
      }
    }

    bucket.push([key, value]);
    this.#count++;

    if (this.#count / this.#buckets.length > HashMap.loadThreshold) {
      this.resize(this.#buckets.length * 2);
    }
  }

  /**
   * Get a value from the HashMap
   * @param key The key to find
   * @returns `Some` if the key is found, or `None` if it is not
   */
  get(key: K): Option<T> {
    const bucket = this.getBucket(key);

    for (let i = 0; i < bucket.length; i++) {
      const [k, v] = bucket[i]!;
      if (this.#hasher.equals(key, k)) {
        return some(v);
      }
    }

    return none();
  }

  /**
   * Get a key-value tuple from the HashMap
   * @param key The key to find
   * @returns `Some([key, value])` if the key is found, or `None` if it is not
   */
  getKeyValue(key: K): Option<[K, T]> {
    const bucket = this.getBucket(key);

    for (let i = 0; i < bucket.length; i++) {
      if (this.#hasher.equals(key, bucket[i]![0])) {
        return some(bucket[i]!);
      }
    }

    return none();
  }

  /**
   * Get a new {@link Entry} object for the key
   * @param key The key to find
   * @returns An `Entry` object that points to this HashMap
   */
  entry(key: K): Entry<K, T> {
    return new Entry(this, key);
  }

  /**
   * Remove an entry from the HashMap
   * @param key The key to remove
   * @returns `Some(val)` if it was found and removed, otherwise `None`
   */
  remove(key: K): Option<T> {
    const bucket = this.getBucket(key);

    for (let i = 0; i < bucket.length; i++) {
      const [k, v] = bucket[i]!;
      if (this.#hasher.equals(key, k)) {
        bucket.splice(i, 1);
        this.#count--;
        return some(v);
      }
    }

    return none();
  }

  /**
   * Resize the HashMap
   * @param newBucketCount The number of buckets the HashMap should now contain
   */
  private resize(newBucketCount: number): void {
    const oldBuckets = this.#buckets;

    const bucketCountFinal = 1 <<
      (32 - Math.clz32(Math.max(newBucketCount, 1) - 1)); // ensure power of 2

    this.#buckets = Array.from({ length: bucketCountFinal }, () => []);

    for (const bucket of oldBuckets) {
      for (const [key, value] of bucket) {
        const hash = this.#hasher.hash(key);
        this.#buckets[Math.abs(hash) & (bucketCountFinal - 1)]!.push([
          key,
          value,
        ]);
      }
    }
  }

  /**
   * Get the current capacity of the HashMap
   * @returns The current capacity
   */
  capacity(): number {
    return Math.floor(this.#buckets.length * HashMap.loadThreshold);
  }

  /**
   * Reserve space for at least `newCount` entries into the HashMap
   * @param newCount The number of entries to reserve space for
   */
  reserve(newCount: number): void {
    const newTotal = newCount + this.#count;
    const newBucketCount = Math.ceil(newTotal / HashMap.loadThreshold);

    if (newBucketCount >= this.#buckets.length) {
      this.resize(newBucketCount);
    }
  }

  /**
   * Shrink the HashMap's storage to contain the minimum amount of space for
   * the current contents
   */
  shrinkToFit(): void {
    const newBucketCount = Math.ceil(this.#count / HashMap.loadThreshold);
    if (newBucketCount < this.#buckets.length) {
      this.resize(newBucketCount);
    }
  }

  /**
   * Shrink the HashMap's storage to a specific capacity.
   * @param newCapacity
   */
  shrinkTo(newCapacity: number): void {
    const targetBucketCount = Math.ceil(newCapacity / HashMap.loadThreshold);
    const minBuckets = Math.ceil(this.#count / HashMap.loadThreshold);

    if (
      targetBucketCount >= minBuckets &&
      targetBucketCount < this.#buckets.length
    ) {
      this.resize(targetBucketCount);
    } else if (targetBucketCount < minBuckets) {
      this.shrinkToFit();
    }
  }

  /**
   * Iterate over the elements in the HashMap
   */
  *[Symbol.iterator](): IterableIterator<[K, T], void, unknown> {
    for (const bucket of this.#buckets) {
      yield* bucket;
    }
  }

  /**
   * Iterate over the keys in the HashMap
   */
  *keys(): IterableIterator<K, void, unknown> {
    for (const [key] of this) {
      yield key;
    }
  }

  /**
   * Iterate over the values in the HashMap
   */
  *values(): IterableIterator<T, void, unknown> {
    for (const [_, value] of this) {
      yield value;
    }
  }

  /**
   * Iterate over {@link Entry} objects in the HashMap
   * @returns An iterator of `Entry` objects
   */
  entries(): IterableIterator<Entry<K, T>, void, unknown> {
    return Iterator.from(this).map(([key]) => new Entry(this, key));
  }

  /**
   * Empty the HashMap's contents. Does not shrink.
   * @returns
   */
  clear(): void {
    this.#buckets = Array.from({ length: this.#buckets.length }, () => []);
    this.#count = 0;
  }

  /**
   * Find if key exists in HashMap
   * @param key The key to find
   * @returns `true` if the key exists in the HashMap, otherwise `false`
   */
  has(key: K): boolean {
    const exists = this.get(key);

    return exists.isSome();
  }

  /**
   * Iterate over the HashMap and empty.
   */
  *drain(): IterableIterator<[K, T]> {
    const oldBuckets = [...this.#buckets];
    this.clear();

    for (const bucket of oldBuckets) {
      yield* bucket;
      bucket.length = 0;
    }
  }

  /**
   * For each element in the HashMap, call a function and replace the element's
   * value with the return value of the function.
   * @param fn A function that takes the old value and key of the current entry
   * and whose return value is the new value for that key.
   */
  map(fn: (value: T, key: K) => T): void {
    for (const bucket of this.#buckets) {
      for (let i = 0; i < bucket.length; i++) {
        bucket[i]![1] = fn(bucket[i]![1], bucket[i]![0]);
      }
    }
  }

  /**
   * Call a function for each element in the HashMap. If the return value is
   * truthy, keep the element in the HashMap. Otherwise, remove it.
   * @param fn A function that takes the old value and key of the current entry
   * and whose return value governs if the element should be kept.
   */
  retain(fn: (value: T, key: K) => boolean): void {
    for (const bucket of this.#buckets) {
      for (let i = bucket.length - 1; i >= 0; i--) {
        if (!fn(bucket[i]![1], bucket[i]![0])) {
          bucket.splice(i, 1);
          this.#count--;
        }
      }
    }
  }
}

import { none, type Option, some } from "@sck/optres";
import { Entry } from "./Entry.ts";

type Bucket<K, T> = [K, T][];
type Hasher<K> = {
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

export class HashMap<K, T> {
  #buckets: Bucket<K, T>[];
  #count: number = 0;
  readonly #hasher: Hasher<K>;
  static loadThreshold = 0.75;

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

  constructor(hasher?: Hasher<K>) {
    this.#hasher = hasher ?? defaultHasher();
    this.#buckets = Array.from({ length: 8 }, () => []);
  }

  inspect(): readonly Bucket<K, T>[] {
    return this.#buckets;
  }

  size(): number {
    return this.#count;
  }

  isEmpty(): boolean {
    return this.#count === 0;
  }

  buckets(): number {
    return this.#buckets.length;
  }

  static from<K, T>(fromArray: [K, T][], hasher?: Hasher<K>): HashMap<K, T> {
    const map = HashMap.withCapacity<K, T>(fromArray.length, hasher);

    for (const [key, value] of fromArray) {
      map.set(key, value);
    }

    return map;
  }

  static withCapacity<K, T>(
    capacity: number,
    hasher?: Hasher<K>,
  ): HashMap<K, T> {
    const map = new HashMap<K, T>(hasher);

    map.resize(Math.ceil(capacity * HashMap.loadThreshold));

    return map;
  }

  private getBucket(key: K): Bucket<K, T> {
    const hash = this.#hasher.hash(key);
    return this.#buckets[Math.abs(hash) & (this.#buckets.length - 1)]!;
  }

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

  getKeyValue(key: K): Option<[K, T]> {
    const bucket = this.getBucket(key);

    for (let i = 0; i < bucket.length; i++) {
      if (this.#hasher.equals(key, bucket[i]![0])) {
        return some(bucket[i]!);
      }
    }

    return none();
  }

  entry(key: K): Entry<K, T> {
    return new Entry(this, key);
  }

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

  capacity(): number {
    return Math.floor(this.#buckets.length * HashMap.loadThreshold);
  }

  reserve(newCount: number): void {
    const newTotal = newCount + this.#count;
    const newBucketCount = Math.ceil(newTotal / HashMap.loadThreshold);

    if (newBucketCount >= this.#buckets.length) {
      this.resize(newBucketCount);
    }
  }

  shrinkToFit(): void {
    const newBucketCount = Math.ceil(this.#count / HashMap.loadThreshold);
    if (newBucketCount < this.#buckets.length) {
      this.resize(newBucketCount);
    }
  }

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

  *[Symbol.iterator](): IterableIterator<[K, T], void, unknown> {
    for (const bucket of this.#buckets) {
      yield* bucket;
    }
  }

  *keys(): IterableIterator<K, void, unknown> {
    for (const [key] of this) {
      yield key;
    }
  }

  *values(): IterableIterator<T, void, unknown> {
    for (const [_, value] of this) {
      yield value;
    }
  }

  entries(): IterableIterator<Entry<K, T>, void, unknown> {
    return Iterator.from(this).map(([key]) => new Entry(this, key));
  }

  clear(): typeof this {
    this.#buckets = Array.from({ length: this.#buckets.length }, () => []);
    this.#count = 0;

    return this;
  }

  has(key: K): boolean {
    const exists = this.get(key);

    return exists.isSome();
  }

  *drain(): IterableIterator<[K, T]> {
    const oldBuckets = [...this.#buckets];
    this.clear();

    for (const bucket of oldBuckets) {
      yield* bucket;
      bucket.length = 0;
    }
  }

  map(fn: (value: T, key: K) => T): void {
    for (const bucket of this.#buckets) {
      for (let i = 0; i < bucket.length; i++) {
        bucket[i]![1] = fn(bucket[i]![1], bucket[i]![0]);
      }
    }
  }

  retain(fn: (key: K, value: T) => boolean): void {
    for (const bucket of this.#buckets) {
      for (let i = bucket.length - 1; i >= 0; i--) {
        if (!fn(bucket[i]![0], bucket[i]![1])) {
          bucket.splice(i, 1);
          this.#count--;
        }
      }
    }
  }
}

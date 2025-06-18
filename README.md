# HashMap.ts

A `HashMap` implementation in TypeScript, inspired by Rust's standard library.
This library supports custom hashing and equality, entry APIs, resizing,
efficient key-value operations, and full iterator support.

## Features

- Generic key-value store
- Customizable hashing via `Hasher<K>`
- Entry API (`Entry<K, T>`) for fine-grained updates
- Auto-resizing based on load factor
- Support for weak and hybrid hashing of object keys
- Full iterator support (`keys()`, `values()`, `entries()`)
- Map-level transformations (`map`, `retain`, `drain`)
- Optional chaining with `Option` support (via `@sck/optres`)

---

## Installation

```sh
deno add @sck/hashmap
```

## Use

```ts
import { HashMap } from "@sck/hashmap";

const map = new HashMap<string, number>();

map.set("one", 1);
map.set("two", 2);

console.log(map.get("one")); // Some(1)
console.log(map.get("three")); // None

map.remove("two");
```

## API Overview

### `HashMap<K, T>`

#### Basic Operations

- `set(key: K, value: T): void` Inserts or updates the value for a given key.

- `get(key: K): Option<T>` Retrieves the value associated with the key.

- `getKeyValue(key: K): Option<[K, T]>` Retrieves both key and value, if
  present.

- `has(key: K): boolean` Checks if the map contains the key.

- `remove(key: K): Option<T>` Removes a key from the map and returns its value.

- `clear(): this` Clears all entries.

---

#### Entry API

- `entry(key: K): Entry<K, T>` Access an entry for mutation or conditional
  insert. Entries are "live" windows into the HashMap.

##### `Entry<K, T>` methods:

- `get(): Option<T>` Returns the current value.

- `insert(value: T): Option<T>` Inserts a value and returns the old one if
  present.

- `orInsert(value: T): Entry<K, T>` Inserts the value if key is not present.

- `orInsertWith(fn: (key: K) => T): Entry<K, T>` Inserts using a function if key
  is not present.

- `andModify(fn: (value: T) => T): Entry<K, T>` Applies a function to the value
  if present.

- `remove(): Option<T>` Removes the entry and returns the value.

- `isOccupied(): boolean` Returns true if the entry is filled.

---

#### Iteration

- `keys(): IterableIterator<K>` Yields all keys.

- `values(): IterableIterator<T>` Yields all values.

- `entries(): IterableIterator<Entry<K, T>>` Yields all entries.

- `[Symbol.iterator](): IterableIterator<[K, T]>` Allows `for...of` iteration.

---

#### Capacity Management

- `reserve(count: number): void` Ensures enough capacity for `count` elements.

- `shrinkTo(capacity: number): void` Shrinks capacity to the given value.

- `shrinkToFit(): void` Shrinks capacity to fit the current number of entries.

- `capacity(): number` Returns the total bucket capacity.

- `size(): number` Returns the number of stored entries.

- `isEmpty(): boolean` Returns `true` if map has no entries.

- `buckets(): number` Returns number of internal buckets (may differ from size).

---

#### Transformations

- `map(fn: (value: T, key: K) => T): void` Transforms all values in place.

- `retain(fn: (key: K, value: T) => boolean): void` Keeps only entries that
  satisfy the predicate.

- `drain(): IterableIterator<[K, T]>` Empties the map and returns all entries.

## Hashing strategies

### Default Hasher

Uses `typeof key + ':' + key.toString()` for string-based keys. Suitable for
primitives.

### `getWeakMapHasher()`

Creates a `Hasher<object>` that tracks object identity using `WeakMap`. Suitable
for use when keys are only objects.

### `getHybridHasher()`

Augments extensible objects with a hidden symbol property for performance. Falls
back to a WeakMap if object is non-extensible.

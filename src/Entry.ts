import type { HashMap } from "./HashMap.ts";
import type { Option } from "@sck/optres";

export class Entry<K, T> {
  #map: HashMap<K, T>;
  #key: K;

  constructor(map: HashMap<K, T>, key: K) {
    this.#map = map;
    this.#key = key;
  }

  private set(value: T): void {
    this.#map.set(this.#key, value);
  }

  isOccupied(): boolean {
    return this.#map.get(this.#key).isSome();
  }

  andModify(fn: (value: T) => T): typeof this {
    this.get().inspect((value) => this.set(fn(value)));

    return this;
  }

  insertEntry(value: T): typeof this {
    this.set(value);
    return this;
  }

  key(): K {
    return this.#key;
  }

  orInsert(value: T): typeof this {
    this.get().match({
      Some: () => {},
      None: () => this.set(value),
    });

    return this;
  }

  orInsertWith(fn: (key: K) => T): typeof this {
    this.get().match({
      Some: () => {},
      None: () => this.set(fn(this.#key)),
    });

    return this;
  }

  get(): Option<T> {
    return this.#map.get(this.#key);
  }

  insert(value: T): Option<T> {
    const oldValue = this.get();

    this.set(value);

    return oldValue;
  }

  remove(): Option<T> {
    return this.get().inspect(() => this.#map.remove(this.#key));
  }

  removeEntry(): Option<[K, T]> {
    return this.get().map((value) => {
      this.#map.remove(this.#key);
      return [this.#key, value];
    });
  }
}

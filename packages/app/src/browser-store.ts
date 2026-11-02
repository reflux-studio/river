import type { KeyValueStore } from '@river/client'

export function browserStore(): KeyValueStore {
  const database = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('river-player', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('data')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  return {
    async get<T>(key: string) {
      const db = await database
      return new Promise<T | undefined>((resolve, reject) => {
        const request = db.transaction('data').objectStore('data').get(key)
        request.onsuccess = () => resolve(request.result as T | undefined)
        request.onerror = () => reject(request.error)
      })
    },
    async set(key, value) {
      const db = await database
      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction('data', 'readwrite')
        transaction.objectStore('data').put(value, key)
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(transaction.error)
        transaction.onabort = () => reject(transaction.error)
      })
    },
    async entries<T>(prefix: string) {
      const db = await database
      return new Promise<T[]>((resolve, reject) => {
        const request = db
          .transaction('data')
          .objectStore('data')
          .getAll(IDBKeyRange.bound(prefix, prefix + '\uffff'))
        request.onsuccess = () => resolve(request.result as T[])
        request.onerror = () => reject(request.error)
      })
    }
  }
}

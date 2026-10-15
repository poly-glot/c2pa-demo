const DATABASE = 'c2pa-demo';
const STORE = 'state';
const KEY = 'current';
const VERSION = 5;

const settle = (request) =>
    new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });

async function withStore(mode, operate) {
    const open = indexedDB.open(DATABASE, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);

    const database = await settle(open);
    try {
        return await settle(operate(database.transaction(STORE, mode).objectStore(STORE)));
    } finally {
        database.close();
    }
}

export const loadState = () =>
    withStore('readonly', (store) => store.get(KEY))
        .then((saved) => (saved?.version === VERSION ? saved.state : null))
        .catch(() => null);

export const saveState = (state) =>
    withStore('readwrite', (store) => store.put({ state, version: VERSION }, KEY)).then(
        () => true,
        () => false,
    );

export const clearState = () => withStore('readwrite', (store) => store.delete(KEY));

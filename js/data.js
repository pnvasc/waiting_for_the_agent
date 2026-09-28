/* ===========================================================================
   Data loading.

   Everything under /data is a plain JSON file fetched from the same local
   server. The files are not part of the repository; each figure shows an
   honest empty state when its file is missing.
   =========================================================================== */

const cache = new Map();

export function load(name) {
  if (!cache.has(name)) {
    cache.set(
      name,
      fetch(`data/${name}.json`)
        .then((r) => {
          if (!r.ok) throw new Error(`${name}.json: ${r.status}`);
          return r.json();
        })
        .catch((err) => {
          console.warn('[data]', err.message);
          return null;                      // figures render an "awaiting data" note
        }),
    );
  }
  return cache.get(name);
}

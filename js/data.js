/* ===========================================================================
   Data loading.

   Everything under /data is a plain JSON file fetched from the same local
   server. Files carry "stub": true while they hold a slice rather than the
   full processed run, so a figure can say so if it wants to.

   The files are currently small real slices of the logs sitting next to this
   deck (focus.jsonl, trace.jsonl), not invented numbers. Replacing a stub with
   a full run is a file swap; no code here changes.

   hook: a future processing step writes the same shapes to the same paths.
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

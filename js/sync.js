/* ===========================================================================
   Deck <-> presenter sync.

   One BroadcastChannel, four message kinds. Either window may lead: the
   presenter's arrow keys drive the deck, and the deck's state drives the
   presenter. A presenter opened before the deck has no state to show, so it
   sends 'hello' and the deck answers with 'state'.

     { type: 'state',   ...deckState }    deck -> presenter
     { type: 'command', name, args }      presenter -> deck  (next/prev/goto)
     { type: 'hello' }                    presenter -> deck  ("who is there?")
     { type: 'clock',   startedAt }       deck -> presenter  (shared elapsed)
   =========================================================================== */

const CHANNEL = 'wwt-deck';

export function createChannel(onMessage) {
  // BroadcastChannel is same-origin only, which is exactly what we want and
  // needs no server. If it is somehow unavailable, the deck still works; it
  // simply has no presenter view.
  if (typeof BroadcastChannel === 'undefined') {
    return { post() {}, close() {} };
  }
  const bc = new BroadcastChannel(CHANNEL);
  bc.onmessage = (e) => onMessage(e.data);
  return {
    post: (msg) => bc.postMessage(msg),
    close: () => bc.close(),
  };
}

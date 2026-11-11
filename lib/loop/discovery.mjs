const snapshotKeys = ['synthetic', 'version', 'availability', 'expires_at', 'offer'];
const offerKeys = ['version', 'price_text', 'trial_text', 'allocation_text', 'activation_text', 'territory'];
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const exact = (value, keys) => value !== null && typeof value === 'object'
  && !Array.isArray(value) && Reflect.ownKeys(value).length === keys.length
  && keys.every(key => Object.hasOwn(value, key));
const closed = () => ({state: 'unknown', canJoin: false, offer: null});

/** Advisory synthetic discovery only; never authorizes admission or production. */
export function getDiscoveryView(snapshot, now) {
  try {
    if (!Number.isSafeInteger(now) || !exact(snapshot, snapshotKeys)
      || snapshot.synthetic !== true || !nonempty(snapshot.version)
      || !['open', 'full', 'paused'].includes(snapshot.availability)
      || !Number.isSafeInteger(snapshot.expires_at) || snapshot.expires_at <= now
      || !exact(snapshot.offer, offerKeys)
      || !offerKeys.every(key => nonempty(snapshot.offer[key]))
      || snapshot.offer.territory !== 'US') return closed();
    if (snapshot.availability !== 'open') {
      return {state: snapshot.availability, canJoin: false, offer: null};
    }
    return {
      state: 'open', canJoin: true,
      offer: Object.fromEntries(offerKeys.map(key => [key, snapshot.offer[key]])),
    };
  } catch {
    return closed();
  }
}

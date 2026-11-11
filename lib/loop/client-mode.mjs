/** Accept only explicitly allowlisted public preview flags from the caller. */
export function isSyntheticPreviewEnabled(env) {
  return env?.DEV === true
    && env?.MODE === 'development'
    && env?.VITE_LOOP_PREVIEW === '1';
}

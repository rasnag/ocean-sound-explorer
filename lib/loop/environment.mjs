// Server/tooling configuration boundary. Do not import process environment into the client.
const disabled = value => value === undefined || value === null || value === ''
  || value === false || value === 'false' || value === '0';
const present = value => value !== undefined && value !== null && value !== '';

/** Resolve only the currently authorized, disconnected local environment. */
export function resolveLoopConfig(env) {
  if (!env || typeof env !== 'object' || Array.isArray(env)
    || env.LOOP_ENV !== 'local-synthetic') {
    throw new Error('Loop requires the exact local-synthetic environment.');
  }
  for (const [key, value] of Object.entries(env)) {
    if (key === 'LOOP_ENV') continue;
    if (key === 'LOOP_AI_ALLOWED' || key === 'LOOP_SMTP_ALLOWED') {
      if (!disabled(value)) throw new Error('External Loop adapters must remain disabled.');
      continue;
    }
    // No provider settings, connection details or role credentials are needed locally.
    // Reject values without echoing keys or credential material into logs.
    if (present(value) && (
      key.startsWith('LOOP_')
      || (key.startsWith('VITE_') && key !== 'VITE_LOOP_PREVIEW')
      || /(?:DATABASE|DB|SMTP|STORAGE|SUPABASE|REDIS|RESEND|ANTHROPIC|OPENAI|AWS|AZURE|CONNECTION|CREDENTIAL|SECRET|TOKEN|API_KEY)/i.test(key)
      || (typeof value === 'string' && /^(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis(?:s)?):\/\//i.test(value))
    )) {
      throw new Error('Connected or private configuration is prohibited in local synthetic mode.');
    }
  }
  return {
    mode: 'local-synthetic',
    external: {ai: false, email: false, database: false, storage: false},
  };
}

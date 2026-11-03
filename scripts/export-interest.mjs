// Run only on your own computer with BLOB_READ_WRITE_TOKEN in the environment.
// Output is a private CSV. Never commit it or place it under public/.
import { list, get, del } from '@vercel/blob';
const quote = (value) => '"' + String(value).replaceAll('"', '""') + '"';
if (process.argv.includes('--clean-limits')) {
  let cursor;
  do {
    const page = await list({ prefix: 'interest/limits/', cursor });
    const stale = page.blobs.filter(
      (blob) => Date.now() - blob.uploadedAt.getTime() > 86400000,
    );
    if (stale.length) await del(stale.map((blob) => blob.url));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  process.exit(0);
}
process.stdout.write('email,joined_at,consent_version,email_verified\n');
let cursor;
do {
  const page = await list({ prefix: 'interest/signups/', cursor });
  for (const blob of page.blobs) {
    const file = await get(blob.url, { access: 'private', useCache: false });
    if (!file || file.statusCode !== 200)
      throw new Error('Could not read a signup');
    const row = await new Response(file.stream).json();
    // Prefix formula-looking cells so spreadsheet imports cannot execute them.
    const email = /^[=+\-@]/.test(row.email) ? "'" + row.email : row.email;
    process.stdout.write(
      [email, row.joinedAt, row.consentVersion, row.emailVerified]
        .map(quote)
        .join(',') + '\n',
    );
  }
  cursor = page.hasMore ? page.cursor : undefined;
} while (cursor);

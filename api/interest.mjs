import { put, del, head, BlobNotFoundError } from '@vercel/blob';
import { createInterestHandler } from '../lib/interest-list.mjs';

async function create(path, content) {
  try {
    await put(path, content, {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: 'application/json',
    });
    return true;
  } catch (error) {
    // Confirm a collision actually exists instead of swallowing a service failure.
    try {
      await head(path);
      return false;
    } catch (lookupError) {
      if (lookupError instanceof BlobNotFoundError) throw error;
      throw lookupError;
    }
  }
}
export async function POST(request) {
  return createInterestHandler({
    create,
    remove: del,
    secret: process.env.INTEREST_LIST_SECRET,
    log: console.error,
  })(request);
}

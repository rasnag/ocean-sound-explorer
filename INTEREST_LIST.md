# Interest list — operating notes (November 2, 2026)

Implemented on homepage-curiosity-loop only. Keep PR #2 in draft; main and production remain unchanged.

## What is collected

Adult email, UTC signup timestamp, exact contact permission and its version, source homepage, and emailVerified=false. Required unchecked adult/contact permission. No child data. No automatic emails, invitations or payments. Addresses are not verified; this is an expressed-interest list, not a confirmed mailing audience. Verify recipients and include an unsubscribe method before any future mailing.

## Where to find sign-ups

Vercel project ocean-sound-explorer → Storage → curiosity-loop-interest-list (private) → interest/signups/. Each JSON file is one signup. Filenames contain keyed hashes, not email addresses. Storage credentials stay server-side. There is no public list/read endpoint.

For CSV export, load BLOB_READ_WRITE_TOKEN privately into the local environment, then run scripts/export-interest.mjs and save stdout outside the repository/public directory. Never commit exported contacts. A spreadsheet formula prefix is escaped on export. For maintenance, scripts/export-interest.mjs --clean-limits deletes only rate markers older than 24 hours. Rate markers are keyed network hashes, never raw IPs. This cleanup is manual, not a scheduled job.

## Leaving

A new subscriber sees a private removal link. Its token is in the URL fragment, so normal page requests do not send it to hosting logs. Visiting the link shows an explicit removal button; posting the signed token deletes that subscriber's JSON record. Keep the link safe. A duplicate sign-up never reveals someone else's removal link. If a person loses their link, Rasna can locate their email in the private store and delete the record after verifying the request.

## Deployment

BLOB_READ_WRITE_TOKEN is connected to this Vercel project by the private store. INTEREST_LIST_SECRET is configured for the homepage-curiosity-loop preview branch only. Production must not be enabled accidentally: before an approved release, configure a separate production secret and preferably a separate production store. Any real preview contacts must be handled explicitly during that transition; don't silently abandon their removal links.

No fixed-price paid plan was added. Blob and function operations use normal Vercel usage billing/quotas. Simple spam protection includes origin checks, a honeypot, bounded input and one storage-backed submission per network per minute. This is a small-list control, not comprehensive bot protection. Review retention and automated cleanup before broad public launch.

## Verification

Nine tests pass, including consent, invalid email, cross-origin rejection, duplicate suppression, rate limiting, signed removal and storage failure. Production build passes. Hosted end-to-end verification is recorded in PR #2 after deployment; synthetic test addresses are removed after testing.

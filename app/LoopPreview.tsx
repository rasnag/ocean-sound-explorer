import React from 'react';
import './loop-preview.css';

export default function LoopPreview() {
  return (
    <main className="loop-preview" aria-labelledby="loop-preview-title">
      <p className="loop-preview-label">Local synthetic preview</p>
      <h1 id="loop-preview-title">Curiosity Loop shell</h1>
      <p>This local development shell contains no family information.</p>
      <section aria-labelledby="loop-preview-boundaries">
        <h2 id="loop-preview-boundaries">Foundation and toy player</h2>
        <p>AI, email, database and storage connections are disabled.</p>
        <p>Joining, private investigations, saved progress and publication are not available in this shell.</p>
        <p><a href="/loop-preview/player">Explore the unreviewed synthetic toy player</a></p>
        <p><a href="/loop-preview/discover">Explore synthetic discovery and availability</a></p>
        <p><a href="/loop-preview/saved">Explore local-server confirmation, resume and separate replays</a> — requires an explicitly launched invented fixture server on this same origin. This is not production saved progress or parent authentication.</p>
      </section>
      <a href="/">Return to the public demos</a>
    </main>
  );
}

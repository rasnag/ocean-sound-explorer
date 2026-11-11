// Invented relational fixtures only. Published rows are NOT human-approved game content.
// No real wonders, nicknames, provider records or production policy values.
const id = (household, record) => `${household.toString().padStart(8, '0')}-0000-4000-8000-${record.toString().padStart(12, '0')}`;

export async function seedSynthetic(db) {
  await db.transaction(async tx => {
    // Serialize fixture loading without changing migration history.
    await tx.exec('LOCK TABLE households IN EXCLUSIVE MODE');
    for (const n of [1, 2]) {
      const h = id(n, 1), child = id(n, 2), request = id(n, 3);
      const revision = id(n, 4), assignment = id(n, 5), play = id(n, 6);
      await tx.query('INSERT INTO households VALUES($1) ON CONFLICT DO NOTHING', [h]);
      await tx.query("INSERT INTO service_consents VALUES($1,1,'active') ON CONFLICT DO NOTHING", [h]);
      await tx.query('INSERT INTO children(household_id,child_id,payload_ref) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [h, child, 'synthetic:encrypted-profile-placeholder']);
      await tx.query('INSERT INTO wonder_requests VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING', [h, request, child, 'synthetic:encrypted-question-placeholder']);
      await tx.query('INSERT INTO request_source_scopes VALUES($1,$2,1,$3) ON CONFLICT DO NOTHING', [h, request, 'synthetic:encrypted-scope-placeholder']);
      await tx.query("INSERT INTO capacity_reservations VALUES($1,$2,$3,1,1,$4,'completed') ON CONFLICT DO NOTHING", [h, id(n, 7), request, id(n, 8)]);
      await tx.query('INSERT INTO entitlements VALUES($1,$2) ON CONFLICT DO NOTHING', [h, id(n, 9)]);
      await tx.query("INSERT INTO adventure_revisions VALUES($1,$2,$3,1,'fixture-1','fixture-engine-1','published',$4) ON CONFLICT DO NOTHING", [h, revision, request, 'synthetic:relational-fixture-not-approved-content']);
      await tx.query('INSERT INTO published_revisions(household_id,revision_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [h, revision]);
      // Select only the immediate primary key as the conflict arbiter. The
      // deferred request uniqueness constraint still runs at transaction commit;
      // PostgreSQL cannot use it as an ON CONFLICT arbiter.
      await tx.query('INSERT INTO assignments VALUES($1,$2,$3,$4,$5) ON CONFLICT (household_id,assignment_id) DO NOTHING', [h, assignment, request, child, revision]);
      await tx.query('INSERT INTO play_sessions VALUES($1,$2,$3,$4,$5,1) ON CONFLICT DO NOTHING', [h, play, assignment, child, revision]);
      await tx.query('INSERT INTO play_events VALUES($1,$2,$3,1,$4::jsonb) ON CONFLICT DO NOTHING', [h, play, id(n, 10), JSON.stringify({synthetic_only: true, payload_ref: 'synthetic:encrypted-event-placeholder'})]);
    }
  });
}

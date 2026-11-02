import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import './about.css';
const steps = [
  ['A question', 'Start with something your child wonders about.'],
  [
    'A little game',
    'Turn that interest into choices, predictions and experiments.',
  ],
  ['Another try', 'Change one thing. See what happens. Try again.'],
  ['The next wonder', 'Meet the real animal. Leave room for another question.'],
];
export default function About() {
  const [scene, setScene] = useState(false);
  useEffect(() => {
    document.title = 'Curiosity Loop — Small games. Big questions.';
  }, []);
  return (
    <main className="about-site">
      <nav className="about-nav" aria-label="Main navigation">
        <a className="about-wordmark" href="/">
          <span>✦</span> Curiosity Loop
        </a>
        <div className="nav-links">
          <a href="#how-it-works">How it works</a>
          <a href="#experiments">Try a game</a>
        </div>
      </nav>
      <section className="about-hero new-hero">
        <div className="hero-copy">
          <div className="about-kicker">✦ Ages 5–8 · Play together</div>
          <h1>
            Small games.
            <br />
            Big <em>“why?”</em>
            <br />
            questions.
          </h1>
          <p>
            A child wonders. A little adventure begins. We turn children’s
            questions into playful investigations—with a grown-up alongside.
          </p>
          <a className="about-cta" href="/shark-night/">
            Try Shark Night <ArrowRight aria-hidden="true" />
          </a>
          <a className="hero-secondary" href="#how-it-works">
            See how a question becomes a game ↓
          </a>
        </div>
        <div className="wonder-preview">
          <div className="preview-top">
            ONE QUESTION, MANY WAYS TO EXPLORE <span>✦</span>
          </div>
          <p className="question-bubble">“How does a fish hide?”</p>
          <div
            className={'fish-scene ' + (scene ? 'changed' : '')}
            aria-hidden="true"
          >
            <span className="fish">🐠</span>
            <span className="reef">🪸</span>
            <span className="bubbles">
              ○<br />◦
            </span>
          </div>
          <div className="preview-bottom">
            <span className="tiny-label">A LITTLE LOOK INSIDE</span>
            <h3>
              {scene
                ? 'Same fish. A different world.'
                : 'Make a guess. Change one thing.'}
            </h3>
            <p aria-live="polite">
              {scene
                ? 'Look again. Does it stand out in the same way?'
                : 'Would those stripes stand out—or blend in?'}
            </p>
            <button type="button" onClick={() => setScene(!scene)}>
              Change the background <ArrowRight size={17} aria-hidden="true" />
            </button>
            <small>Illustrative scene · not a science test</small>
          </div>
        </div>
      </section>
      <section
        className="loop-section"
        id="how-it-works"
        aria-labelledby="loop-heading"
      >
        <div className="loop-intro">
          <p className="about-section-label">The curiosity loop</p>
          <h2 id="loop-heading">
            Their question.
            <br />A place to explore it.
          </h2>
        </div>
        <ol className="loop-steps">
          {steps.map(([t, d], i) => (
            <li key={t}>
              <span>0{i + 1}</span>
              <strong>{t}</strong>
              <p>{d}</p>
            </li>
          ))}
        </ol>
        <p className="loop-footnote">
          Made by hand, tried with families, and refined from what happens
          during play. Personalized games are currently part of a small assisted
          pilot.
        </p>
      </section>
      <section className="question-story content-section">
        <div>
          <p className="about-section-label">From wonder to play</p>
          <h2>
            What does it eat?
            <br />
            How does it escape?
            <br />
            What’s inside?
          </h2>
          <p>
            Three questions about an angelfish can become three ways to
            investigate. The child gets to do something with each question.
          </p>
          <small>An illustrative example of our game-making approach.</small>
        </div>
        <div className="story-rounds">
          {[
            [
              '01',
              'Feed it',
              'Choose a plate. Swap one item. See what the fish can eat.',
            ],
            [
              '02',
              'Find cover',
              'Choose a hiding place. Compare the fish with its surroundings.',
            ],
            [
              '03',
              'Look inside',
              'Explore how air in a swim bladder changes where a fish floats.',
            ],
          ].map(([n, t, d]) => (
            <article key={n}>
              <span>{n}</span>
              <div>
                <h3>{t}</h3>
                <p>{d}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="experiments" id="experiments">
        <div className="experiments-heading">
          <div>
            <p className="about-section-label">Start exploring</p>
            <h2>One game. Lots to wonder.</h2>
          </div>
          <p>
            Try a public demo together. Let your child choose, make a
            prediction, and have another go.
          </p>
        </div>
        <article className="shark-feature">
          <div className="shark-art" aria-hidden="true">
            <span>🦈</span>
            <i>✦</i>
            <b>GUESS · TRY · DISCOVER</b>
          </div>
          <div>
            <p className="about-section-label">Playable demo</p>
            <h3>Shark Night</h3>
            <p>
              Step into a shark adventure. Make predictions, explore what
              happens, and spot the difference between real facts and game
              rules.
            </p>
            <div className="parent-note">
              <strong>Your part:</strong> read the short prompts together, then
              give your child room to choose.
            </div>
            <a className="about-cta" href="/shark-night/">
              Play Shark Night <ArrowRight aria-hidden="true" />
            </a>
          </div>
        </article>
        <details className="earlier-games">
          <summary>Explore our earlier experiments</summary>
          <div>
            <a href="/ocean-sound-explorer">
              <strong>Ocean Sound Explorer ↗</strong>
              <span>
                Listen to real animal calls and guess who’s making them.
              </span>
            </a>
            <a href="/make-the-moon">
              <strong>Make the Moon ↗</strong>
              <span>Move a tiny simulation, then look for the real Moon.</span>
            </a>
          </div>
        </details>
      </section>
      <section className="report-section content-section">
        <div>
          <p className="about-section-label">Look closer at play</p>
          <h2>
            More than
            <br />
            “Did they like it?”
          </h2>
          <p>
            Our pilot play records help us see what a child tried, what changed
            between attempts, and where an explanation helped. That gives us
            something concrete to build on.
          </p>
          <p>
            They’re observations of a session, not scores of a child’s ability.
          </p>
        </div>
        <article className="sample-report">
          <div className="report-header">
            EXPLORER’S NOTEBOOK <span>✦</span>
          </div>
          <h3>A little window into play</h3>
          <p className="report-caption">
            Illustrative summary · no real child’s data
          </p>
          <dl>
            {[
              [
                'First try',
                'Chose a hiding place that matched the previous background.',
              ],
              [
                'Next try',
                'Changed the hiding place after looking at the new surroundings.',
              ],
              [
                'A helpful moment',
                'A grown-up’s explanation made the next choice clearer.',
              ],
              [
                'Something to explore next',
                'Would the same hiding place work somewhere else?',
              ],
            ].map(([t, d]) => (
              <div key={t}>
                <dt>{t}</dt>
                <dd>{d}</dd>
              </div>
            ))}
          </dl>
        </article>
      </section>
      <section className="play-principles content-section">
        <p className="about-section-label">Built for exploring together</p>
        <div className="principle-grid">
          {[
            [
              '↻',
              'Choices and experiments',
              'Make a prediction, change one thing, and see what happens.',
            ],
            [
              '◉',
              'A window into the real',
              'Real footage and photos connect playful worlds to actual animals. Facts and game rules are kept distinct.',
            ],
            [
              '✦',
              'A grown-up alongside',
              'Read a short prompt, listen to their idea, and help when something needs explaining.',
            ],
          ].map(([s, t, d]) => (
            <article key={t}>
              <span>{s}</span>
              <h3>{t}</h3>
              <p>{d}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="about-thesis">
        <p className="about-section-label">Our bigger question</p>
        <div>
          <h2>Can technology make kids more curious about the real world?</h2>
          <p>
            That’s the question behind Curiosity Loop. Early family sessions
            have brought retries, new questions during play, and requests to see
            real animals.
          </p>
          <p>
            We’re still learning whether those moments continue beyond the game.
            More noticing, wondering and investigating off-screen is the
            ambition.
          </p>
          <p className="founder-line">
            Founded by Rasna, with education advisor Emily Speck. We make small
            experiments, watch closely, and use what we learn to make the next
            one.
          </p>
        </div>
      </section>
      <section className="pilot-section content-section" id="pilot">
        <p className="about-section-label">Follow the next chapter</p>
        <h2>
          A game from your
          <br />
          child’s own question?
        </h2>
        <p>
          We’re exploring this with a small group of families. Future places
          aren’t open yet.
        </p>
        <p className="pilot-preview-note">
          An interest list is planned. This preview does not collect contact
          details or children’s questions.
        </p>
      </section>
      <footer className="about-footer">
        <a className="about-wordmark" href="/">
          <span>✦</span> Curiosity Loop
        </a>
        <p>Small experiments. Real-world wonder.</p>
      </footer>
    </main>
  );
}

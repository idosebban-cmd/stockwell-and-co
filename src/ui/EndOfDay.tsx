/** End of the day: the day's name, 1–3 stars, one picture highlight, what the till took, and Next day. */
import type { Highlight } from '../sim/highlight';
import { pounds } from '../sim/engine';
import type { PersonLook } from '../sim/types';
import { Shopper, StaffFigure } from './art/Characters';

export function EndOfDay({ day, stars, highlight, look, cashChange, onNext }: { day: string; stars: 1 | 2 | 3; highlight: Highlight; look?: PersonLook; cashChange: number; onNext: () => void }) {
  return (
    <main className="eod" id="main">
      <section className="eod-card" aria-labelledby="eod-h">
        <h1 id="eod-h">{day} done!</h1>
        <div className="eod-stars" role="img" aria-label={`${stars} star${stars === 1 ? '' : 's'} out of 3`}>
          {[0, 1, 2].map((i) => (
            <svg key={i} className={`eod-star ${i < stars ? 'won' : ''} ${i === 1 ? 'big' : ''}`} viewBox="0 0 100 100" aria-hidden="true" style={{ animationDelay: `${i * 260}ms` }}>
              <path d="M50 6 L62 36 L94 38 L69 58 L77 90 L50 72 L23 90 L31 58 L6 38 L38 36 Z" strokeLinejoin="round" />
              {i < stars && <path d="M38 40 L50 16" stroke="#fff3c4" strokeWidth="6" strokeLinecap="round" fill="none" />}
            </svg>
          ))}
        </div>
        <figure className="eod-highlight">
          <HighlightArt h={highlight} look={look} />
          <figcaption>{highlight.text}</figcaption>
        </figure>
        <p className={`eod-cash ${cashChange < 0 ? 'down' : ''}`}>
          <svg width="34" height="34" viewBox="0 0 32 32" aria-hidden="true">
            <circle cx="16" cy="16" r="14" fill="#f2c23a" stroke="#a8740c" strokeWidth="2.5" />
            <text x="16" y="21.5" textAnchor="middle" fontSize="15" fontWeight="800" fill="#7a540a">
              £
            </text>
          </svg>
          {cashChange >= 0 ? '+' : '−'}
          {pounds(Math.abs(cashChange)).replace('−', '')}
        </p>
        <button type="button" className="btn-primary btn-big" onClick={onNext} autoFocus>
          Next day ▶
        </button>
      </section>
    </main>
  );
}

function HighlightArt({ h, look }: { h: Highlight; look?: PersonLook }) {
  return (
    <svg className="eod-art" viewBox="0 0 320 180" width="320" height="180" aria-hidden="true">
      <rect width="320" height="180" rx="20" fill="#f7e6c6" />
      <ellipse cx="160" cy="160" rx="120" ry="12" fill="rgba(60,25,5,0.15)" />
      {h.kind === 'staff' && (
        <g>
          <rect x="190" y="104" width="110" height="40" rx="6" fill="#a8673a" />
          <rect x="190" y="96" width="110" height="12" rx="4" fill="#c78755" />
          <rect x="268" y="80" width="26" height="16" rx="3" fill="#3a3330" />
          <rect x="271" y="83" width="20" height="8" fill="#7cd38a" />
          <g transform="translate(150 158) scale(2.1)">
            <StaffFigure id={h.staffId} look={look} pose="scan" tired={false} />
          </g>
          {[40, 70, 100].map((x, i) => (
            <g key={x} transform={`translate(${x} 158) scale(1.5)`}>
              <Shopper n={i + 4} fill={0.8} />
            </g>
          ))}
          <path d="M150 22 l6 12 l13 2 l-10 9 l3 13 l-12 -7 l-12 7 l3 -13 l-10 -9 l13 -2 Z" fill="#f2c23a" stroke="#a8740c" strokeWidth="2" />
        </g>
      )}
      {h.kind === 'happy' && (
        <g>
          {[70, 130, 190, 250].map((x, i) => (
            <g key={x}>
              <g transform={`translate(${x} 160) scale(1.7)`}>
                <Shopper n={i + 2} fill={0.7} />
              </g>
              <g transform={`translate(${x} 50)`}>
                <circle r="16" fill="#ffd36b" stroke="#a8740c" strokeWidth="2" />
                <circle cx="-5" cy="-3" r="2.2" fill="#2f1308" />
                <circle cx="5" cy="-3" r="2.2" fill="#2f1308" />
                <path d="M-7 4 q7 8 14 0" stroke="#2f1308" strokeWidth="2.4" fill="none" strokeLinecap="round" />
              </g>
            </g>
          ))}
        </g>
      )}
      {h.kind === 'mop' && (
        <g>
          <ellipse cx="160" cy="146" rx="70" ry="16" fill="#f6fbff" stroke="#9cc7d6" strokeWidth="3" />
          <path d="M140 30 L176 140" stroke="#8a6a44" strokeWidth="6" strokeLinecap="round" />
          <path d="M160 136 h36 l-6 14 h-24z" fill="#9db7c8" stroke="rgba(60,28,12,0.5)" strokeWidth="2" />
          <path d="M226 40 l5 10 l11 2 l-8 7 l2 11 l-10 -5 l-10 5 l2 -11 l-8 -7 l11 -2 Z" fill="#f2c23a" />
          <path d="M86 60 l4 8 l9 1 l-7 6 l2 9 l-8 -4 l-8 4 l2 -9 l-7 -6 l9 -1 Z" fill="#f2c23a" />
        </g>
      )}
      {h.kind === 'crowd' && (
        <g>
          {Array.from({ length: 9 }, (_, i) => (
            <g key={i} transform={`translate(${40 + i * 30} ${150 + (i % 2) * 10}) scale(1.4)`}>
              <Shopper n={i + 1} fill={0.9} />
            </g>
          ))}
        </g>
      )}
      {h.kind === 'cat' && (
        <g transform="translate(160 140) scale(3)">
          <ellipse cx="0" cy="-6" rx="16" ry="9" fill="#e08a3c" />
          <circle cx="13" cy="-13" r="8" fill="#e08a3c" />
          <path d="M8 -19 l2 -7 l4 6z M15 -20 l4 -6 l1 7z" fill="#e08a3c" />
          <path d="M9.5 -13 q1.6 1.2 3.2 0 M15 -13 q1.6 1.2 3.2 0" stroke="#3a2418" strokeWidth="1.2" fill="none" />
          <path d="M-15 -4 q-12 2 -9 -9" fill="none" stroke="#e08a3c" strokeWidth="4.5" strokeLinecap="round" />
          <text x="22" y="-20" fontSize="8" fontWeight="800" fill="#6d5b4b">
            z z
          </text>
        </g>
      )}
    </svg>
  );
}

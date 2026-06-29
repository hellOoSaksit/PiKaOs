import { useEffect, useRef } from 'react';

const TILTS = ['-9deg', '6deg', '-5deg', '8deg', '-7deg', '5deg'];

/**
 * Letters3D — PiKaOs 3D cartoon word. Renders one <span class="ltr"> per glyph.
 * Drops in on mount (staggered), jelly-wobbles on click. Relies on the global
 * `.ltr` recipe in src/styles/styles.css. Covers Latin + Thai via Mitr.
 *
 * props: word (string), drop (bool, default true), dropStep (s), style, className
 */
export default function Letters3D({ word = 'PiKaOs', drop = true, dropStep = 0.18, className = '', style }) {
  const ref = useRef(null);
  useEffect(() => {
    // ensure drop only runs as the entrance (not on re-render)
  }, []);

  const jelly = (e) => {
    const el = e.currentTarget;
    el.classList.remove('jelly', 'drop');
    void el.offsetWidth; // force reflow → restart animation
    el.classList.add('jelly');
  };

  return (
    <span
      ref={ref}
      className={'pk-letters' + (className ? ' ' + className : '')}
      style={{ display: 'inline-flex', gap: '0.04em', '--drop-step': dropStep + 's', ...style }}
      aria-label={word}
    >
      {word.split('').map((ch, i) => (
        <span
          key={i}
          className={'ltr' + (drop ? ' drop' : '')}
          onClick={jelly}
          style={{ '--i': i, '--tilt': TILTS[i % TILTS.length] }}
        >
          {ch}
        </span>
      ))}
    </span>
  );
}

import { useEffect, useState } from 'react';

const STAGES = [
  [0, 'Connecting…'],
  [35, 'Fetching records…'],
  [70, 'Almost there…'],
  [92, 'Finishing up…'],
];

/**
 * LoadingPopup — centered modal with the pixel-art CEO walk sprite (walks in place),
 * an auto-advancing progress bar, and a status label that cycles by threshold.
 * At 100% the walker stops on frame 0, the fill turns emerald, then onDone() fires.
 * Sprite sheet lives at public/assets/ceo-walk.png (40 frames, 158px cells).
 */
export default function LoadingPopup({ open, title = 'Loading your workspace', onDone }) {
  const [pct, setPct] = useState(0);

  useEffect(() => {
    if (!open) { setPct(0); return; }
    setPct(0);
    const iv = setInterval(() => {
      setPct((p) => {
        if (p >= 100) { clearInterval(iv); return 100; }
        return Math.min(100, p + Math.random() * 13 + 4);
      });
    }, 360);
    return () => clearInterval(iv);
  }, [open]);

  useEffect(() => {
    if (open && pct >= 100) {
      const t = setTimeout(() => onDone && onDone(), 700);
      return () => clearTimeout(t);
    }
  }, [pct, open, onDone]);

  const done = pct >= 100;
  const label = [...STAGES].reverse().find(([t]) => pct >= t)[1];

  return (
    <div className={'pk-overlay' + (open ? ' open' : '')}>
      <div className="pk-modal load" role="status">
        <div className="load-title">{done ? 'Ready' : title}</div>
        <div className="load-frame">
          <div className={'walker' + (done ? ' done' : '')} />
        </div>
        <div className="load-track"><div className={'load-fill' + (done ? ' done' : '')} style={{ width: pct + '%' }} /></div>
        <div className="load-meta">
          <span className="load-label">{done ? 'Done' : label}</span>
          <span className="load-pct">{Math.round(pct)}%</span>
        </div>
      </div>
    </div>
  );
}

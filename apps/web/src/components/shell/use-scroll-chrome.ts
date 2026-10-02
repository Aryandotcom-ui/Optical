'use client';

import { useEffect, useState } from 'react';

/**
 * Header behaviour from scroll position: `scrolled` after 8 px (adds the
 * frosted background), `hidden` while scrolling down past the fold, shown
 * again on any upward scroll. Uses one passive listener and rAF.
 */
export function useScrollChrome(): { scrolled: boolean; hidden: boolean } {
  const [state, setState] = useState({ scrolled: false, hidden: false });

  useEffect(() => {
    let lastY = window.scrollY;
    let frame = 0;
    const update = () => {
      frame = 0;
      const y = window.scrollY;
      const delta = y - lastY;
      setState((previous) => {
        const scrolled = y > 8;
        let hidden = previous.hidden;
        if (y < 120) hidden = false;
        else if (delta > 6) hidden = true;
        else if (delta < -6) hidden = false;
        return previous.scrolled === scrolled && previous.hidden === hidden
          ? previous
          : { scrolled, hidden };
      });
      lastY = y;
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return state;
}

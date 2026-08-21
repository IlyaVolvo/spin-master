import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMember } from '../utils/auth';
import {
  clearPreferFullApp,
  memberHasPlayerRole,
  requiresLandscapeForFullApp,
} from '../utils/meMode';

type LandscapeRequiredOverlayProps = {
  /** When true, never show (e.g. dedicated kiosk locked UI). */
  disabled?: boolean;
};

/**
 * Blocks the full-app shell when the viewport cannot fit the header top line
 * (logo, Actions, icon cluster). `/me` is allowed; Players can return there.
 */
export function LandscapeRequiredOverlay({ disabled = false }: LandscapeRequiredOverlayProps) {
  const navigate = useNavigate();
  const [blocked, setBlocked] = useState(() =>
    !disabled && typeof window !== 'undefined' ? requiresLandscapeForFullApp() : false,
  );

  useEffect(() => {
    if (disabled) {
      setBlocked(false);
      return;
    }
    const update = () => setBlocked(requiresLandscapeForFullApp());
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, [disabled]);

  if (!blocked) return null;

  const canGoMe = memberHasPlayerRole(getMember());

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="landscape-required-title"
      aria-describedby="landscape-required-desc"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 20000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        boxSizing: 'border-box',
        background: 'rgba(15, 32, 48, 0.92)',
        color: '#f5f8fb',
      }}
    >
      <div
        style={{
          maxWidth: '360px',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '14px',
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '16px',
            border: '2px solid rgba(255,255,255,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '28px',
            transform: 'rotate(90deg)',
          }}
        >
          ⛶
        </div>
        <h2 id="landscape-required-title" style={{ margin: 0, fontSize: '22px', fontWeight: 700 }}>
          Landscape required
        </h2>
        <p id="landscape-required-desc" style={{ margin: 0, fontSize: '15px', lineHeight: 1.45, opacity: 0.92 }}>
          Rotate your device to landscape (or use a wider screen) so the top bar — logo, Actions, and
          controls — can fit on one line.
        </p>
        {canGoMe ? (
          <button
            type="button"
            onClick={() => {
              clearPreferFullApp();
              navigate('/me', { replace: true });
            }}
            style={{
              marginTop: '8px',
              padding: '12px 20px',
              borderRadius: '10px',
              border: 'none',
              background: '#fff',
              color: '#1f3b57',
              fontWeight: 700,
              fontSize: '15px',
              cursor: 'pointer',
            }}
          >
            Open Me hub
          </button>
        ) : null}
      </div>
    </div>
  );
}

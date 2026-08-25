import { useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { APP_NAME } from '../../brand';
import { getMember } from '../../utils/auth';
import { setPreferFullApp } from '../../utils/meMode';
import { HeaderSelfCheckinButton } from '../HeaderSelfCheckinButton';
import { HostTodayBoard } from '../HostTodayBoard';
import { MemberPlanScreen } from '../players/MemberPlanScreen';
import { MeSettingsOverlay } from './MeSettingsOverlay';

type MePageProps = {
  clubName: string | null;
  onLogout: () => void | Promise<void>;
};

const tileBase: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  width: '100%',
  minHeight: '72px',
  border: '1px solid #d5dbe3',
  borderRadius: '12px',
  background: '#e8ecf0',
  color: '#1f3b57',
  cursor: 'pointer',
  fontWeight: 700,
  fontSize: '14px',
  boxShadow: '0 1px 4px rgba(31, 59, 87, 0.06)',
  padding: '10px 12px',
};

/**
 * Phone-first personal hub: Settings, Payment, Check-in/out, Logout.
 */
export function MePage({ clubName, onLogout }: MePageProps) {
  const navigate = useNavigate();
  const member = getMember();
  const [showSettings, setShowSettings] = useState(false);
  const [showPlan, setShowPlan] = useState(false);

  const displayName = useMemo(() => {
    if (!member) return '';
    return `${member.firstName || ''} ${member.lastName || ''}`.trim() || member.email || 'Member';
  }, [member]);

  const brandLabel = (clubName && clubName.trim()) || APP_NAME;
  const monogram = brandLabel.trim().charAt(0).toUpperCase() || 'S';

  const goFullApp = () => {
    setPreferFullApp(true);
    navigate('/players', { replace: true });
  };

  if (!member) {
    return null;
  }

  return (
    <div
      style={{
        minHeight: '100dvh',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(180deg, #e8f1f8 0%, #f4f7fa 42%, #ffffff 100%)',
        paddingTop: 'max(16px, env(safe-area-inset-top))',
        paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
        paddingLeft: 'max(16px, env(safe-area-inset-left))',
        paddingRight: 'max(16px, env(safe-area-inset-right))',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '16px',
        }}
      >
        <img
          src="/favicon.svg"
          alt=""
          width={44}
          height={44}
          style={{ borderRadius: '10px', flexShrink: 0 }}
          onError={(e) => {
            e.currentTarget.style.display = 'none';
            const sibling = e.currentTarget.nextElementSibling as HTMLElement | null;
            if (sibling) sibling.style.display = 'flex';
          }}
        />
        <div
          aria-hidden="true"
          style={{
            display: 'none',
            width: '44px',
            height: '44px',
            borderRadius: '10px',
            background: '#1f3b57',
            color: '#fff',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            fontSize: '20px',
            flexShrink: 0,
          }}
        >
          {monogram}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: '18px',
              fontWeight: 800,
              color: '#1f3b57',
              lineHeight: 1.2,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {brandLabel}
          </div>
          <div
            style={{
              fontSize: '14px',
              color: '#5a6a7a',
              marginTop: '2px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {displayName}
          </div>
        </div>
      </header>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          width: '100%',
          maxWidth: '420px',
          margin: '0 auto',
        }}
      >
        <HeaderSelfCheckinButton
          variant="tile"
          controlStyle={tileBase}
          onOpenOwnPlan={() => setShowPlan(true)}
        />

        <HostTodayBoard variant="full" />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <button type="button" style={tileBase} onClick={() => setShowSettings(true)}>
            <span style={{ fontSize: '22px', lineHeight: 1 }} aria-hidden="true">
              ⚙️
            </span>
            <span>Settings</span>
          </button>

          <button type="button" style={tileBase} onClick={() => setShowPlan(true)}>
            <span style={{ fontSize: '22px', lineHeight: 1 }} aria-hidden="true">
              $
            </span>
            <span>Payment</span>
          </button>
        </div>

        <button
          type="button"
          style={tileBase}
          onClick={() => {
            void onLogout();
          }}
        >
          <span style={{ fontSize: '22px', lineHeight: 1 }} aria-hidden="true">
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </span>
          <span>Logout</span>
        </button>
      </div>

      <div style={{ marginTop: '16px', textAlign: 'center' }}>
        <button
          type="button"
          onClick={goFullApp}
          style={{
            border: 'none',
            background: 'transparent',
            color: '#2e86de',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
            padding: '8px 12px',
            textDecoration: 'underline',
          }}
        >
          Full app
        </button>
      </div>

      {showSettings ? <MeSettingsOverlay onClose={() => setShowSettings(false)} /> : null}
      {showPlan ? (
        <MemberPlanScreen memberId={member.id} onClose={() => setShowPlan(false)} />
      ) : null}
    </div>
  );
}

export default MePage;

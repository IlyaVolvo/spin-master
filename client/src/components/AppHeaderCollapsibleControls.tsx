import { useLayoutEffect, useMemo, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { getMember } from '../utils/auth';
import { clearAllScrollPositions, clearAllUIStates } from '../utils/scrollPosition';
import { CollapsibleActions, type CollapsibleActionButton } from './CollapsibleActions';
import { HeaderSelfCheckinButton } from './HeaderSelfCheckinButton';
import { PlayersKioskEntryButton } from './PlayersKioskEntryButton';
import { canEnterBrowseKiosk, canEnterCheckinKiosk } from '../utils/auth';

type AdminMenuItem =
  | { id: 'separator'; label: string; active: false }
  | { id: 'payment-log' | 'attendance-log' | 'plans' | 'settings'; label: string; active: boolean };

export type AppHeaderCollapsibleControlsProps = {
  headerIconControlSize: CSSProperties;
  showPlayersTab: boolean;
  showTournamentsTab: boolean;
  isAdminUser: boolean;
  kioskMode: boolean;
  userName: string;
  showMeReturn: boolean;
  showAchievementsLink: boolean;
  isPlayersActive: boolean;
  isTournamentsActive: boolean;
  isAdminSectionActive: boolean;
  isAchievementsActive: boolean;
  hasPendingPreregistrations: boolean;
  pendingPreregistrationCount: number;
  adminMenuLabel: string;
  adminMenuWidth: string;
  adminMenuOpen: boolean;
  setAdminMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  adminMenuRef: React.MutableRefObject<HTMLDivElement | null>;
  adminMenuItems: readonly AdminMenuItem[];
  onPlayersClick: (e: React.MouseEvent<HTMLAnchorElement>) => void;
  onTournamentsClick: (e: React.MouseEvent<HTMLAnchorElement>) => void;
  onSettingsClick: (e?: React.MouseEvent) => void;
  onPaymentsClick: (e?: React.MouseEvent, tab?: 'payments' | 'plans') => void;
  onAttendanceClick: (e?: React.MouseEvent) => void;
  onLogout: () => void;
};

const headerLinkMeasureStyle: CSSProperties = {
  padding: '2px 8px',
  fontSize: '11px',
  fontWeight: 500,
  lineHeight: 1.2,
  borderRadius: '4px',
  whiteSpace: 'nowrap',
};

export function AppHeaderCollapsibleControls({
  headerIconControlSize,
  showPlayersTab,
  showTournamentsTab,
  isAdminUser,
  kioskMode,
  userName,
  showMeReturn,
  showAchievementsLink,
  isPlayersActive,
  isTournamentsActive,
  isAdminSectionActive,
  isAchievementsActive,
  hasPendingPreregistrations,
  pendingPreregistrationCount,
  adminMenuLabel,
  adminMenuWidth,
  adminMenuOpen,
  setAdminMenuOpen,
  adminMenuRef,
  adminMenuItems,
  onPlayersClick,
  onTournamentsClick,
  onSettingsClick,
  onPaymentsClick,
  onAttendanceClick,
  onLogout,
}: AppHeaderCollapsibleControlsProps) {
  const navigate = useNavigate();
  const [adminMenuPosition, setAdminMenuPosition] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!adminMenuOpen) {
      setAdminMenuPosition(null);
      return;
    }
    const updatePosition = () => {
      const rect = adminMenuRef.current?.getBoundingClientRect();
      if (!rect) return;
      setAdminMenuPosition({ top: rect.bottom + 4, left: rect.left });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [adminMenuOpen, adminMenuRef]);

  const tabStyle = (active: boolean, pending = false): CSSProperties => ({
    ...headerIconControlSize,
    minWidth: 'auto',
    padding: '10px 18px 12px 18px',
    color: pending ? '#c0392b' : (active ? '#333' : 'rgba(255, 255, 255, 0.8)'),
    textDecoration: 'none',
    background: pending ? '#fdecea' : (active ? 'white' : 'rgba(255, 255, 255, 0.15)'),
    borderRadius: '8px',
    border: active ? '1px solid rgba(0, 0, 0, 0.1)' : '1px solid rgba(255, 255, 255, 0.2)',
    fontWeight: active ? '600' : '500',
    cursor: 'pointer',
    boxShadow: active ? '0 2px 4px rgba(0, 0, 0, 0.1)' : 'none',
    whiteSpace: 'nowrap',
  });

  const iconButtonStyle: CSSProperties = {
    ...headerIconControlSize,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  };

  const showKioskEntry = !kioskMode && (canEnterCheckinKiosk() || canEnterBrowseKiosk());
  const showUserControls = Boolean(userName) && !kioskMode;

  const openOwnPlan = () => {
    const member = getMember();
    if (!member) return;
    clearAllScrollPositions();
    clearAllUIStates();
    window.scrollTo(0, 0);
    navigate('/players', { state: { openOwnPlan: true, memberId: member.id }, replace: false });
  };

  const openOwnProfile = () => {
    const member = getMember();
    if (!member) return;
    clearAllScrollPositions();
    clearAllUIStates();
    window.scrollTo(0, 0);
    navigate('/players', {
      state: { editOwnProfile: true, memberId: member.id, editProfileKey: Date.now() },
      replace: false,
    });
  };

  const allMenuItems = useMemo(() => {
    const menu: CollapsibleActionButton[] = [];
    if (showPlayersTab) {
      menu.push({
        key: 'nav-players',
        label: 'Players',
        active: isPlayersActive,
        onClick: () => {
          clearAllScrollPositions();
          clearAllUIStates();
          window.scrollTo(0, 0);
          navigate('/players', { replace: true });
        },
      });
    }
    if (showTournamentsTab) {
      menu.push({
        key: 'nav-tournaments',
        label: hasPendingPreregistrations
          ? `Tournaments (${pendingPreregistrationCount})`
          : 'Tournaments',
        active: isTournamentsActive,
        onClick: () => {
          clearAllScrollPositions();
          clearAllUIStates();
          window.scrollTo(0, 0);
          navigate('/tournaments', { replace: true });
        },
      });
    }
    if (isAdminUser) {
      for (const item of adminMenuItems) {
        if (item.id === 'separator') continue;
        menu.push({
          key: `admin-${item.id}`,
          label: item.label,
          active: item.active,
          onClick: () => {
            if (item.id === 'settings') onSettingsClick();
            else if (item.id === 'attendance-log') onAttendanceClick();
            else if (item.id === 'plans') onPaymentsClick(undefined, 'plans');
            else onPaymentsClick(undefined, 'payments');
          },
        });
      }
    }
    return menu;
  }, [
    showPlayersTab,
    showTournamentsTab,
    isAdminUser,
    adminMenuItems,
    hasPendingPreregistrations,
    pendingPreregistrationCount,
    isPlayersActive,
    isTournamentsActive,
    navigate,
    onSettingsClick,
    onAttendanceClick,
    onPaymentsClick,
  ]);

  const headerActionsLabel = isPlayersActive
    ? 'Players'
    : isTournamentsActive
      ? (hasPendingPreregistrations
        ? `Tournaments (${pendingPreregistrationCount})`
        : 'Tournaments')
      : isAdminSectionActive
        ? adminMenuLabel
        : isAchievementsActive
          ? 'Achievements'
          : 'Actions';

  const measureSlot = useMemo(() => (
    <div className="collapsible-actions__row app-header-measure-row">
      {showPlayersTab ? (
        <button type="button" className="app-header-tab" style={tabStyle(isPlayersActive)} disabled tabIndex={-1} aria-hidden="true">
          Players
        </button>
      ) : null}
      {showTournamentsTab ? (
        <button type="button" className="app-header-tab" style={tabStyle(isTournamentsActive, hasPendingPreregistrations)} disabled tabIndex={-1} aria-hidden="true">
          Tournaments{hasPendingPreregistrations ? ` (${pendingPreregistrationCount})` : ''}
        </button>
      ) : null}
      {isAdminUser ? (
        <button type="button" className="app-header-tab" style={{ ...tabStyle(isAdminSectionActive), minWidth: adminMenuWidth, width: adminMenuWidth }} disabled tabIndex={-1} aria-hidden="true">
          {adminMenuLabel} ▾
        </button>
      ) : null}
    </div>
  ), [
    showPlayersTab,
    showTournamentsTab,
    isAdminUser,
    isPlayersActive,
    isTournamentsActive,
    isAdminSectionActive,
    hasPendingPreregistrations,
    pendingPreregistrationCount,
    adminMenuLabel,
    adminMenuWidth,
    headerIconControlSize,
  ]);

  const visibleSlot = (
    <div className="app-header-collapsible-visible">
      <div
        className="app-header-left"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          flexShrink: 0,
          minWidth: 0,
        }}
      >
        <div
          className="app-header-tabs"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: '6px',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
            {showPlayersTab ? (
              <a className="app-header-tab" href="/players" onClick={onPlayersClick} style={tabStyle(isPlayersActive)}>
                Players
              </a>
            ) : null}
            {showTournamentsTab ? (
              <a className="app-header-tab" href="/tournaments" onClick={onTournamentsClick} style={tabStyle(isTournamentsActive, hasPendingPreregistrations)}>
                Tournaments
                {hasPendingPreregistrations ? (
                  <span style={{ marginLeft: '6px', fontWeight: 700 }}>
                    ({pendingPreregistrationCount})
                  </span>
                ) : null}
              </a>
            ) : null}
            {isAdminUser ? (
              <div ref={adminMenuRef} style={{ position: 'relative', marginLeft: '8px' }}>
                <button
                  type="button"
                  className="app-header-tab"
                  aria-haspopup="menu"
                  aria-expanded={adminMenuOpen}
                  onClick={() => setAdminMenuOpen((open) => !open)}
                  style={{
                    ...tabStyle(isAdminSectionActive),
                    minWidth: adminMenuWidth,
                    width: adminMenuWidth,
                    padding: '10px 12px 12px 12px',
                    justifyContent: 'space-between',
                    gap: '6px',
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{adminMenuLabel}</span>
                  <span aria-hidden="true" style={{ fontSize: '12px', flexShrink: 0 }}>▾</span>
                </button>
                {adminMenuOpen && adminMenuPosition ? createPortal(
                  <div
                    role="menu"
                    aria-label="Admin pages"
                    data-admin-menu
                    style={{
                      position: 'fixed',
                      top: adminMenuPosition.top,
                      left: adminMenuPosition.left,
                      width: adminMenuWidth,
                      minWidth: adminMenuWidth,
                      background: 'white',
                      border: '1px solid rgba(0, 0, 0, 0.12)',
                      borderRadius: '8px',
                      boxShadow: '0 8px 20px rgba(0, 0, 0, 0.18)',
                      zIndex: 10050,
                      overflow: 'hidden',
                      padding: '4px 0',
                      boxSizing: 'border-box',
                    }}
                  >
                    {adminMenuItems.map((item) => {
                      if (item.id === 'separator') {
                        return (
                          <div
                            key="separator"
                            role="separator"
                            style={{ height: '1px', background: '#d8e8f0', margin: '6px 10px' }}
                          />
                        );
                      }
                      return (
                        <button
                          key={item.id}
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            if (item.id === 'settings') onSettingsClick();
                            else if (item.id === 'attendance-log') onAttendanceClick();
                            else if (item.id === 'plans') onPaymentsClick(undefined, 'plans');
                            else onPaymentsClick(undefined, 'payments');
                          }}
                          style={{
                            display: 'block',
                            width: '100%',
                            boxSizing: 'border-box',
                            textAlign: 'left',
                            padding: '10px 14px',
                            border: 'none',
                            background: item.active ? '#eaf4fb' : 'transparent',
                            color: item.active ? '#155b78' : '#17324d',
                            fontWeight: item.active ? 700 : 600,
                            fontSize: '14px',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {item.label}
                        </button>
                      );
                    })}
                  </div>,
                  document.body,
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <CollapsibleActions
        variant="header"
        menuLabel={headerActionsLabel}
        visibleSlot={visibleSlot}
        measureSlot={measureSlot}
        allMenuItems={allMenuItems}
      />
      <div
        className="app-header-user"
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          justifyContent: 'flex-start',
          marginLeft: 'auto',
          flexShrink: 0,
        }}
      >
        <div className="app-header-user-row" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {showUserControls ? (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              {showMeReturn ? (
                <button
                  type="button"
                  onClick={() => {
                    clearAllScrollPositions();
                    clearAllUIStates();
                    window.scrollTo(0, 0);
                    navigate('/me', { replace: false });
                  }}
                  title="Simple phone hub"
                  aria-label="Open simple phone hub"
                  style={{ ...iconButtonStyle, fontWeight: 700, fontSize: '12px' }}
                >
                  Me
                </button>
              ) : null}
              <button type="button" onClick={openOwnPlan} title="View and manage your club plan" aria-label="View and manage your club plan" style={{ ...iconButtonStyle, fontWeight: 700 }}>
                $
              </button>
              <button type="button" onClick={openOwnProfile} title="Edit your profile" style={iconButtonStyle}>
                ⚙️
              </button>
              <HeaderSelfCheckinButton controlStyle={headerIconControlSize} />
            </div>
          ) : null}
          {!kioskMode ? (
            <button type="button" onClick={onLogout} title="Logout" aria-label="Logout" style={iconButtonStyle}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          ) : null}
        </div>
        <div
          className="app-header-user-links"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            right: 0,
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '6px',
            minHeight: '18px',
          }}
        >
          {showKioskEntry ? <PlayersKioskEntryButton /> : null}
          {showAchievementsLink ? (
            <button
              type="button"
              className="app-header-public-link"
              onClick={() => window.open('/public', '_blank', 'noopener,noreferrer')}
              title="Open public pages in a new tab"
              style={{
                ...headerLinkMeasureStyle,
                color: isAchievementsActive ? '#fff' : 'rgba(255, 255, 255, 0.75)',
                background: isAchievementsActive ? 'rgba(255, 255, 255, 0.22)' : 'transparent',
                border: '1px solid rgba(255, 255, 255, 0.35)',
                cursor: 'pointer',
              }}
            >
              Public
            </button>
          ) : null}
          {!kioskMode ? (
            <button
              type="button"
              className="app-header-public-link"
              onClick={() => window.open('/role-tutorials/index.html', '_blank', 'noopener,noreferrer')}
              title="Open role tutorials in a new tab"
              style={{
                ...headerLinkMeasureStyle,
                color: 'rgba(255, 255, 255, 0.75)',
                background: 'transparent',
                border: '1px solid rgba(255, 255, 255, 0.35)',
                cursor: 'pointer',
              }}
            >
              Tutorials
            </button>
          ) : null}
        </div>
      </div>
    </>
  );
}

import React from 'react';
import type { NameDisplayOrder } from '../../utils/nameFormatter';
import { setNameDisplayOrder } from '../../utils/nameFormatter';

export interface PlayersSettingsMenuProps {
  showSettingsMenu: boolean;
  setShowSettingsMenu: React.Dispatch<React.SetStateAction<boolean>>;
  showIdColumn: boolean;
  setShowIdColumn: React.Dispatch<React.SetStateAction<boolean>>;
  showAgeColumn: boolean;
  setShowAgeColumn: React.Dispatch<React.SetStateAction<boolean>>;
  showStatusColumn: boolean;
  setShowStatusColumn: React.Dispatch<React.SetStateAction<boolean>>;
  showGamesColumn: boolean;
  setShowGamesColumn: React.Dispatch<React.SetStateAction<boolean>>;
  showAllPlayers: boolean;
  setShowAllPlayers: React.Dispatch<React.SetStateAction<boolean>>;
  showAllRoles: boolean;
  setShowAllRoles: React.Dispatch<React.SetStateAction<boolean>>;
  nameDisplayOrder: NameDisplayOrder;
  setNameDisplayOrderState: React.Dispatch<React.SetStateAction<NameDisplayOrder>>;
  fetchMatches: () => void | Promise<void>;
  fetchMembers: () => void | Promise<void>;
  isAdminUser: boolean;
  isSelectingForStats: boolean;
  isSelectingForHistory: boolean;
  supportsFullSaveDialog: boolean;
  onExportPlayers: () => void;
  onImportPlayers: (event: React.ChangeEvent<HTMLInputElement>) => void;
  importSendEmail: boolean;
  setImportSendEmail: React.Dispatch<React.SetStateAction<boolean>>;
}

/**
 * Roster table header: display toggles, name order, admin CSV import/export.
 * Additional member/club settings can live in this folder next to this component.
 */
export const PlayersSettingsMenu: React.FC<PlayersSettingsMenuProps> = ({
  showSettingsMenu,
  setShowSettingsMenu,
  showIdColumn,
  setShowIdColumn,
  showAgeColumn,
  setShowAgeColumn,
  showStatusColumn,
  setShowStatusColumn,
  showGamesColumn,
  setShowGamesColumn,
  showAllPlayers,
  setShowAllPlayers,
  showAllRoles,
  setShowAllRoles,
  nameDisplayOrder,
  setNameDisplayOrderState,
  fetchMatches,
  fetchMembers,
  isAdminUser,
  isSelectingForStats,
  isSelectingForHistory,
  supportsFullSaveDialog,
  onExportPlayers,
  onImportPlayers,
  importSendEmail,
  setImportSendEmail,
}) => (
  <div style={{ position: 'relative', display: 'inline-block' }} data-settings-menu>
    <button
      type="button"
      onClick={() => setShowSettingsMenu(!showSettingsMenu)}
      className="button-filter"
      style={{
        padding: '6px 12px',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '13px',
      }}
    >
      ⚙️ Settings
    </button>
    {showSettingsMenu && (
      <div
        style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          marginTop: '5px',
          backgroundColor: '#f5f5f5',
          border: '1px solid #ddd',
          borderRadius: '4px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
          padding: '10px',
          minWidth: '200px',
          zIndex: 10001,
        }}
      >
        <div style={{ marginBottom: '6px', fontWeight: 'bold', borderBottom: '1px solid #ddd', paddingBottom: '4px', fontSize: '13px' }}>
          Display Options
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', marginBottom: '4px', fontSize: '13px' }}>
          <input
            type="checkbox"
            checked={showIdColumn}
            onChange={(e) => {
              const checked = e.target.checked;
              setShowIdColumn(checked);
              localStorage.setItem('players_showIdColumn', checked.toString());
            }}
            style={{ cursor: 'pointer', margin: 0 }}
          />
          <span>Show ID Column</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', marginBottom: '4px', fontSize: '13px' }}>
          <input
            type="checkbox"
            checked={showAgeColumn}
            onChange={(e) => {
              const checked = e.target.checked;
              setShowAgeColumn(checked);
              localStorage.setItem('players_showAgeColumn', checked.toString());
            }}
            style={{ cursor: 'pointer', margin: 0 }}
          />
          <span>Show Age Column</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', marginBottom: '4px', fontSize: '13px' }}>
          <input
            type="checkbox"
            checked={showStatusColumn}
            onChange={(e) => {
              const checked = e.target.checked;
              setShowStatusColumn(checked);
              localStorage.setItem('players_showStatusColumn', checked.toString());
            }}
            style={{ cursor: 'pointer', margin: 0 }}
          />
          <span>Show Status Column</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', marginBottom: '4px', fontSize: '13px' }}>
          <input
            type="checkbox"
            checked={showGamesColumn}
            onChange={(e) => {
              const checked = e.target.checked;
              setShowGamesColumn(checked);
              localStorage.setItem('players_showGamesColumn', checked.toString());
              if (checked) {
                void fetchMatches();
              }
            }}
            style={{ cursor: 'pointer', margin: 0 }}
          />
          <span>Show Games Column</span>
        </label>
        <div style={{ borderTop: '1px solid #ddd', marginTop: '6px', marginBottom: '6px' }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', marginBottom: '4px', fontSize: '13px' }}>
          <input
            type="checkbox"
            checked={showAllPlayers}
            onChange={(e) => {
              const checked = e.target.checked;
              setShowAllPlayers(checked);
              localStorage.setItem('players_showAllPlayers', checked.toString());
            }}
            style={{ cursor: 'pointer', margin: 0 }}
          />
          <span>Show All Players (including inactive)</span>
        </label>
        {isAdminUser && (
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', marginBottom: '4px', fontSize: '13px' }}>
            <input
              type="checkbox"
              checked={showAllRoles}
              onChange={(e) => {
                const checked = e.target.checked;
                setShowAllRoles(checked);
                localStorage.setItem('players_showAllRoles', checked.toString());
                if (checked) {
                  void fetchMembers();
                }
              }}
              style={{ cursor: 'pointer', margin: 0 }}
            />
            <span>Show All Members</span>
          </label>
        )}
        <div style={{ borderTop: '1px solid #ddd', paddingTop: '6px', marginTop: '6px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold', marginBottom: '4px', fontSize: '13px' }}>
            <span>Name:</span>
            <select
              value={nameDisplayOrder}
              onChange={(e) => {
                const order = e.target.value as NameDisplayOrder;
                setNameDisplayOrderState(order);
                setNameDisplayOrder(order);
              }}
              style={{
                padding: '3px 6px',
                cursor: 'pointer',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '12px',
              }}
            >
              <option value="firstLast">First Last</option>
              <option value="lastFirst">Last, First</option>
            </select>
          </label>
        </div>
        <div style={{ borderTop: '1px solid #ddd', marginTop: '6px', marginBottom: '6px' }} />
        {isAdminUser && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
            {(() => {
              const isDisabled = isSelectingForStats || isSelectingForHistory;
              const isExportDisabled = isDisabled || !supportsFullSaveDialog;
              const buttonBaseStyle: React.CSSProperties = {
                padding: '6px 12px',
                fontSize: '12px',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                width: '100%',
                textAlign: 'center',
              };
              const exportButtonStyle: React.CSSProperties = {
                ...buttonBaseStyle,
                backgroundColor: isExportDisabled ? '#95a5a6' : '#3498db',
                cursor: isExportDisabled ? 'not-allowed' : 'pointer',
                opacity: isExportDisabled ? 0.7 : 1,
              };
              const importButtonStyle: React.CSSProperties = {
                ...buttonBaseStyle,
                backgroundColor: isDisabled ? '#95a5a6' : '#3498db',
                cursor: isDisabled ? 'not-allowed' : 'pointer',
                opacity: isDisabled ? 0.7 : 1,
              };

              return (
                <>
                  <button
                    type="button"
                    onClick={onExportPlayers}
                    disabled={isExportDisabled}
                    className="button-3d"
                    style={exportButtonStyle}
                    title={
                      supportsFullSaveDialog
                        ? 'Export players to CSV'
                        : 'Full Save As (name + location) is not supported in Safari. Use Chrome/Edge.'
                    }
                  >
                    Export
                  </button>
                  {!supportsFullSaveDialog && (
                    <div style={{ fontSize: '11px', color: '#a65b00', lineHeight: 1.3 }}>
                      Full Save As is unavailable in Safari. Use Chrome/Edge for location + name selection.
                    </div>
                  )}
                  <label className="button-3d" style={importButtonStyle} title="Import players from CSV">
                    📤 Import
                    <input type="file" accept=".csv" onChange={onImportPlayers} disabled={isDisabled} style={{ display: 'none' }} />
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#555', cursor: 'pointer', marginTop: '2px' }}>
                    <input
                      type="checkbox"
                      checked={importSendEmail}
                      onChange={(e) => setImportSendEmail(e.target.checked)}
                      style={{ margin: 0, cursor: 'pointer' }}
                    />
                    Send invitation email
                  </label>
                </>
              );
            })()}
          </div>
        )}
      </div>
    )}
  </div>
);

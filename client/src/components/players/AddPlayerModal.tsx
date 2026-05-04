import React from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

export interface AddPlayerModalProps {
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  newPlayerFirstName: string;
  setNewPlayerFirstName: (v: string) => void;
  newPlayerLastName: string;
  setNewPlayerLastName: (v: string) => void;
  newPlayerBirthDate: Date | null;
  setNewPlayerBirthDate: (d: Date | null) => void;
  newPlayerEmail: string;
  setNewPlayerEmail: (v: string) => void;
  newPlayerTournamentNotificationsEnabled: boolean;
  setNewPlayerTournamentNotificationsEnabled: (v: boolean) => void;
  newPlayerGender: 'MALE' | 'FEMALE' | 'NOT_SPECIFIED';
  setNewPlayerGender: (v: 'MALE' | 'FEMALE' | 'NOT_SPECIFIED') => void;
  newPlayerRoles: string[];
  setNewPlayerRoles: (r: string[]) => void;
  newPlayerRating: string;
  setNewPlayerRating: (v: string) => void;
  newPlayerPhone: string;
  setNewPlayerPhone: (v: string) => void;
  newPlayerAddress: string;
  setNewPlayerAddress: (v: string) => void;
  newPlayerPicture: string;
  setNewPlayerPicture: (v: string) => void;
  addFieldErrors: Record<string, string>;
  addFieldTouched: Record<string, boolean>;
  setAddFieldTouched: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setAddFieldErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  validateAddField: (field: string, value?: any) => string;
  handleAddFieldChange: (field: string, value: any) => void;
  handleAddFieldBlur: (field: string) => void;
  handleAddRatingBlur: () => void | Promise<void>;
  submitButtonLabel?: string;
}

export const AddPlayerModal: React.FC<AddPlayerModalProps> = ({
  onClose,
  onSubmit,
  newPlayerFirstName,
  setNewPlayerFirstName,
  newPlayerLastName,
  setNewPlayerLastName,
  newPlayerBirthDate,
  setNewPlayerBirthDate,
  newPlayerEmail,
  setNewPlayerEmail,
  newPlayerTournamentNotificationsEnabled,
  setNewPlayerTournamentNotificationsEnabled,
  newPlayerGender,
  setNewPlayerGender,
  newPlayerRoles,
  setNewPlayerRoles,
  newPlayerRating,
  setNewPlayerRating,
  newPlayerPhone,
  setNewPlayerPhone,
  newPlayerAddress,
  setNewPlayerAddress,
  newPlayerPicture,
  setNewPlayerPicture,
  addFieldErrors,
  addFieldTouched,
  setAddFieldTouched,
  setAddFieldErrors,
  validateAddField,
  handleAddFieldChange,
  handleAddFieldBlur,
  handleAddRatingBlur,
  submitButtonLabel = 'Save Member & Send Invitation',
}) => {
  const hasEmail = newPlayerEmail.trim().length > 0;

  return (
  <div
    style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 10001,
    }}
  >
    <div
      className="card"
      style={{ maxWidth: '500px', width: '90%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', position: 'relative' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexShrink: 0 }}>
        <h3 style={{ margin: 0 }}>Add Player</h3>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            fontSize: '24px',
            cursor: 'pointer',
            color: '#666',
            padding: '0',
            width: '30px',
            height: '30px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title="Close"
        >
          ×
        </button>
      </div>
      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <div style={{ overflowY: 'auto', flex: 1, paddingRight: '10px' }}>
          <div className={`form-group ${addFieldErrors.firstName && addFieldTouched.firstName ? 'has-error' : addFieldTouched.firstName && !addFieldErrors.firstName ? 'is-valid' : ''}`}>
            <label>First Name *</label>
            <input
              type="text"
              value={newPlayerFirstName}
              onChange={(e) => {
                setNewPlayerFirstName(e.target.value);
                handleAddFieldChange('firstName', e.target.value);
              }}
              onBlur={() => handleAddFieldBlur('firstName')}
              placeholder="First name"
              autoFocus
            />
            {addFieldTouched.firstName && addFieldErrors.firstName && <span className="field-error">{addFieldErrors.firstName}</span>}
          </div>
          <div className={`form-group ${addFieldErrors.lastName && addFieldTouched.lastName ? 'has-error' : addFieldTouched.lastName && !addFieldErrors.lastName ? 'is-valid' : ''}`}>
            <label>Last Name *</label>
            <input
              type="text"
              value={newPlayerLastName}
              onChange={(e) => {
                setNewPlayerLastName(e.target.value);
                handleAddFieldChange('lastName', e.target.value);
              }}
              onBlur={() => handleAddFieldBlur('lastName')}
              placeholder="Last name"
            />
            {addFieldTouched.lastName && addFieldErrors.lastName && <span className="field-error">{addFieldErrors.lastName}</span>}
          </div>
          <div className={`form-group ${addFieldErrors.birthDate && addFieldTouched.birthDate ? 'has-error' : addFieldTouched.birthDate && !addFieldErrors.birthDate ? 'is-valid' : ''}`}>
            <label>Birth Date (optional)</label>
            <DatePicker
              selected={newPlayerBirthDate}
              onChange={(date: Date | null) => {
                setNewPlayerBirthDate(date);
                handleAddFieldChange('birthDate', date);
                if (!addFieldTouched.birthDate) {
                  setAddFieldTouched((prev) => ({ ...prev, birthDate: true }));
                }
                const err = validateAddField('birthDate', date);
                setAddFieldErrors((prev) => ({ ...prev, birthDate: err }));
              }}
              onBlur={() => handleAddFieldBlur('birthDate')}
              dateFormat="yyyy-MM-dd"
              showYearDropdown
              showMonthDropdown
              dropdownMode="select"
              scrollableYearDropdown
              yearDropdownItemNumber={100}
              placeholderText="Select birth date"
              className="date-picker-input"
              wrapperClassName="date-picker-wrapper"
            />
            {addFieldTouched.birthDate && addFieldErrors.birthDate && <span className="field-error">{addFieldErrors.birthDate}</span>}
          </div>
          <div className={`form-group ${addFieldErrors.email && addFieldTouched.email ? 'has-error' : addFieldTouched.email && !addFieldErrors.email ? 'is-valid' : ''}`}>
            <label>Email (optional)</label>
            <input
              type="email"
              value={newPlayerEmail}
              onChange={(e) => {
                const v = e.target.value;
                setNewPlayerEmail(v);
                if (!v.trim()) {
                  setNewPlayerRoles(['PLAYER']);
                  setNewPlayerTournamentNotificationsEnabled(false);
                  handleAddFieldChange('roles', ['PLAYER']);
                }
                handleAddFieldChange('email', v);
              }}
              onBlur={() => handleAddFieldBlur('email')}
              placeholder="email@example.com"
            />
            {addFieldTouched.email && addFieldErrors.email && <span className="field-error">{addFieldErrors.email}</span>}
          </div>
          <div className="form-group">
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: hasEmail ? 'pointer' : 'not-allowed',
                color: hasEmail ? 'inherit' : '#999',
                fontSize: '13px',
              }}
            >
              <input
                type="checkbox"
                checked={hasEmail && newPlayerTournamentNotificationsEnabled}
                disabled={!hasEmail}
                onChange={(e) => setNewPlayerTournamentNotificationsEnabled(e.target.checked)}
                style={{ cursor: hasEmail ? 'pointer' : 'not-allowed', margin: 0 }}
              />
              <span>Receive tournament registration notifications</span>
            </label>
            {!hasEmail && (
              <div style={{ marginTop: '4px', fontSize: '12px', color: '#777' }}>
                Add an email before enabling tournament notifications.
              </div>
            )}
          </div>
          <div className={`form-group ${addFieldErrors.gender && addFieldTouched.gender ? 'has-error' : addFieldTouched.gender && !addFieldErrors.gender ? 'is-valid' : ''}`}>
            <label>Gender</label>
            <select
              value={newPlayerGender}
              onChange={(e) => {
                setNewPlayerGender(e.target.value as 'MALE' | 'FEMALE' | 'NOT_SPECIFIED');
                handleAddFieldChange('gender', e.target.value);
                if (!addFieldTouched.gender) {
                  setAddFieldTouched((prev) => ({ ...prev, gender: true }));
                }
                const err = validateAddField('gender', e.target.value);
                setAddFieldErrors((prev) => ({ ...prev, gender: err }));
              }}
              onBlur={() => handleAddFieldBlur('gender')}
            >
              <option value="NOT_SPECIFIED">Not specified</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
            </select>
            {addFieldTouched.gender && addFieldErrors.gender && <span className="field-error">{addFieldErrors.gender}</span>}
          </div>
          <div className={`form-group ${addFieldErrors.roles && addFieldTouched.roles ? 'has-error' : addFieldTouched.roles && !addFieldErrors.roles ? 'is-valid' : ''}`}>
            <label>Roles *</label>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(120px, 1fr))',
                columnGap: '16px',
                rowGap: '8px',
                paddingTop: '4px',
              }}
            >
              {['PLAYER', 'COACH', 'ORGANIZER', 'ADMIN'].map((role) => (
                <label
                  key={role}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    margin: 0,
                    lineHeight: 1.2,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={newPlayerRoles.includes(role)}
                    disabled={!hasEmail && role !== 'PLAYER'}
                    onChange={(e) => {
                      const nextRoles = e.target.checked ? [...newPlayerRoles, role] : newPlayerRoles.filter((r) => r !== role);
                      setNewPlayerRoles(nextRoles);
                      handleAddFieldChange('roles', nextRoles);
                      if (!addFieldTouched.roles) {
                        setAddFieldTouched((prev) => ({ ...prev, roles: true }));
                      }
                      const err = validateAddField('roles', nextRoles);
                      setAddFieldErrors((prev) => ({ ...prev, roles: err }));
                    }}
                    style={{ cursor: 'pointer', margin: 0 }}
                  />
                  <span>{role}</span>
                </label>
              ))}
            </div>
            {addFieldTouched.roles && addFieldErrors.roles && <span className="field-error">{addFieldErrors.roles}</span>}
          </div>
          <div className={`form-group ${addFieldErrors.rating && addFieldTouched.rating ? 'has-error' : ''}`}>
            <label>Initial Rating (optional)</label>
            <input
              type="number"
              step="1"
              min="0"
              max="9999"
              value={newPlayerRating}
              onChange={(e) => {
                setNewPlayerRating(e.target.value);
                handleAddFieldChange('rating', e.target.value);
              }}
              onBlur={handleAddRatingBlur}
              placeholder="Leave empty for unrated (0-9999)"
            />
            {addFieldTouched.rating && addFieldErrors.rating && <span className="field-error">{addFieldErrors.rating}</span>}
          </div>
          <div className={`form-group ${addFieldErrors.phone && addFieldTouched.phone ? 'has-error' : ''}`}>
            <label>Phone (optional)</label>
            <input
              type="tel"
              value={newPlayerPhone}
              onChange={(e) => {
                setNewPlayerPhone(e.target.value);
                handleAddFieldChange('phone', e.target.value);
              }}
              onBlur={() => handleAddFieldBlur('phone')}
              placeholder="Phone number"
            />
            {addFieldTouched.phone && addFieldErrors.phone && <span className="field-error">{addFieldErrors.phone}</span>}
          </div>
          <div className="form-group">
            <label>Address (optional)</label>
            <input type="text" value={newPlayerAddress} onChange={(e) => setNewPlayerAddress(e.target.value)} placeholder="Address" />
          </div>
          <div className={`form-group ${addFieldErrors.picture && addFieldTouched.picture ? 'has-error' : ''}`}>
            <label>Picture URL (optional)</label>
            <input
              type="url"
              value={newPlayerPicture}
              onChange={(e) => {
                setNewPlayerPicture(e.target.value);
                handleAddFieldChange('picture', e.target.value);
              }}
              onBlur={() => handleAddFieldBlur('picture')}
              placeholder="Image URL"
            />
            {addFieldTouched.picture && addFieldErrors.picture && <span className="field-error">{addFieldErrors.picture}</span>}
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            gap: '10px',
            justifyContent: 'flex-end',
            marginTop: '20px',
            paddingTop: '20px',
            borderTop: '1px solid #eee',
            flexShrink: 0,
          }}
        >
          <button type="button" onClick={onClose} className="button-filter">
            Cancel
          </button>
          <button type="submit" className="button-3d">
            {submitButtonLabel}
          </button>
        </div>
      </form>
    </div>
  </div>
  );
};

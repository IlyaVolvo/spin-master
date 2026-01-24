import React, { useState } from 'react';
import { PanelConfig, PanelAction } from '../../types/tournament';
import './BasePanel.css';

interface BasePanelProps {
  config: PanelConfig;
  className?: string;
  children?: React.ReactNode;
}

export const BasePanel: React.FC<BasePanelProps> = ({ 
  config, 
  className = '', 
  children 
}) => {
  const [isExpanded, setIsExpanded] = useState(config.expanded ?? true);

  const handleToggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  const handleActionClick = (action: PanelAction) => {
    if (!action.disabled) {
      action.onClick();
    }
  };

  if (!config.visible) {
    return null;
  }

  return (
    <div className={`base-panel ${className}`}>
      {/* Panel Header */}
      <div className="base-panel__header">
        <div className="base-panel__title-section">
          {config.collapsible && (
            <button
              className="base-panel__expand-button"
              onClick={handleToggleExpand}
              aria-expanded={isExpanded}
              aria-label={isExpanded ? 'Collapse' : 'Expand'}
            >
              <span className={`base-panel__expand-icon ${isExpanded ? 'expanded' : ''}`}>
                ▼
              </span>
            </button>
          )}
          <h3 className="base-panel__title">{config.title}</h3>
        </div>
        
        {config.actions && config.actions.length > 0 && (
          <div className="base-panel__actions">
            {config.actions.map((action) => (
              <button
                key={action.id}
                className={`base-panel__action base-panel__action--${action.variant || 'secondary'}`}
                onClick={() => handleActionClick(action)}
                disabled={action.disabled}
                title={action.disabled ? undefined : action.label}
              >
                {action.icon && <span className="base-panel__action-icon">{action.icon}</span>}
                <span className="base-panel__action-label">{action.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Panel Content */}
      {isExpanded && (
        <div className="base-panel__content">
          {children || config.render()}
        </div>
      )}
    </div>
  );
};

export default BasePanel;

import React, { useState, useCallback, useMemo } from 'react';
import { PanelConfig, UIState } from '../../types/tournament';
import { BasePanel } from './BasePanel';

interface PanelManagerProps {
  initialPanels: PanelConfig[];
  onStateChange?: (state: UIState) => void;
  className?: string;
}

export const PanelManager: React.FC<PanelManagerProps> = ({
  initialPanels,
  onStateChange,
  className = ''
}) => {
  const [panels, setPanels] = useState<PanelConfig[]>(initialPanels);
  const [uiState, setUiState] = useState<UIState>({
    activePanels: new Set(initialPanels.filter(p => p.visible).map(p => p.id)),
    expandedPanels: new Set(initialPanels.filter(p => p.expanded).map(p => p.id)),
    panelData: {}
  });

  // Update panel configuration
  const updatePanel = useCallback((panelId: string, updates: Partial<PanelConfig>) => {
    setPanels(prevPanels => 
      prevPanels.map(panel => 
        panel.id === panelId 
          ? { ...panel, ...updates }
          : panel
      )
    );
  }, []);

  // Show/hide panel
  const togglePanelVisibility = useCallback((panelId: string, visible?: boolean) => {
    updatePanel(panelId, { 
      visible: visible !== undefined ? visible : !panels.find(p => p.id === panelId)?.visible 
    });
    
    setUiState(prev => {
      const newActivePanels = new Set(prev.activePanels);
      if (visible === false) {
        newActivePanels.delete(panelId);
      } else if (visible === true) {
        newActivePanels.add(panelId);
      } else {
        // Toggle
        if (newActivePanels.has(panelId)) {
          newActivePanels.delete(panelId);
        } else {
          newActivePanels.add(panelId);
        }
      }
      return { ...prev, activePanels: newActivePanels };
    });
  }, [panels, updatePanel]);

  // Expand/collapse panel
  const togglePanelExpansion = useCallback((panelId: string, expanded?: boolean) => {
    updatePanel(panelId, { 
      expanded: expanded !== undefined ? expanded : !panels.find(p => p.id === panelId)?.expanded 
    });
    
    setUiState(prev => {
      const newExpandedPanels = new Set(prev.expandedPanels);
      if (expanded === false) {
        newExpandedPanels.delete(panelId);
      } else if (expanded === true) {
        newExpandedPanels.add(panelId);
      } else {
        // Toggle
        if (newExpandedPanels.has(panelId)) {
          newExpandedPanels.delete(panelId);
        } else {
          newExpandedPanels.add(panelId);
        }
      }
      return { ...prev, expandedPanels: newExpandedPanels };
    });
  }, [panels, updatePanel]);

  // Store panel-specific data
  const setPanelData = useCallback((panelId: string, data: any) => {
    setUiState(prev => ({
      ...prev,
      panelData: {
        ...prev.panelData,
        [panelId]: data
      }
    }));
  }, []);

  // Get panel-specific data
  const getPanelData = useCallback((panelId: string) => {
    return uiState.panelData[panelId];
  }, [uiState.panelData]);

  // Notify parent of state changes
  React.useEffect(() => {
    onStateChange?.(uiState);
  }, [uiState, onStateChange]);

  // Memoize visible panels for performance
  const visiblePanels = useMemo(() => {
    return panels.filter(panel => panel.visible);
  }, [panels]);

  return (
    <div className={`panel-manager ${className}`}>
      {visiblePanels.map((panel) => (
        <BasePanel
          key={panel.id}
          config={{
            ...panel,
            expanded: uiState.expandedPanels.has(panel.id),
            actions: panel.actions?.map(action => ({
              ...action,
              onClick: () => {
                action.onClick();
                // Force re-render if action affects panel state
                setPanels(prev => [...prev]);
              }
            }))
          }}
        />
      ))}
    </div>
  );
};

// Hook for using panel manager state
export const usePanelManager = (initialPanels: PanelConfig[]) => {
  const [panels, setPanels] = useState<PanelConfig[]>(initialPanels);
  const [uiState, setUiState] = useState<UIState>({
    activePanels: new Set(initialPanels.filter(p => p.visible).map(p => p.id)),
    expandedPanels: new Set(initialPanels.filter(p => p.expanded).map(p => p.id)),
    panelData: {}
  });

  const updatePanel = useCallback((panelId: string, updates: Partial<PanelConfig>) => {
    setPanels(prevPanels => 
      prevPanels.map(panel => 
        panel.id === panelId 
          ? { ...panel, ...updates }
          : panel
      )
    );
  }, []);

  const showPanel = useCallback((panelId: string) => {
    updatePanel(panelId, { visible: true });
    setUiState(prev => ({
      ...prev,
      activePanels: new Set([...prev.activePanels, panelId])
    }));
  }, [updatePanel]);

  const hidePanel = useCallback((panelId: string) => {
    updatePanel(panelId, { visible: false });
    setUiState(prev => {
      const newActivePanels = new Set(prev.activePanels);
      newActivePanels.delete(panelId);
      return { ...prev, activePanels: newActivePanels };
    });
  }, [updatePanel]);

  const expandPanel = useCallback((panelId: string) => {
    updatePanel(panelId, { expanded: true });
    setUiState(prev => ({
      ...prev,
      expandedPanels: new Set([...prev.expandedPanels, panelId])
    }));
  }, [updatePanel]);

  const collapsePanel = useCallback((panelId: string) => {
    updatePanel(panelId, { expanded: false });
    setUiState(prev => {
      const newExpandedPanels = new Set(prev.expandedPanels);
      newExpandedPanels.delete(panelId);
      return { ...prev, expandedPanels: newExpandedPanels };
    });
  }, [updatePanel]);

  const setPanelData = useCallback((panelId: string, data: any) => {
    setUiState(prev => ({
      ...prev,
      panelData: {
        ...prev.panelData,
        [panelId]: data
      }
    }));
  }, []);

  const getPanelData = useCallback((panelId: string) => {
    return uiState.panelData[panelId];
  }, [uiState.panelData]);

  return {
    panels,
    uiState,
    updatePanel,
    showPanel,
    hidePanel,
    expandPanel,
    collapsePanel,
    setPanelData,
    getPanelData
  };
};

export default PanelManager;

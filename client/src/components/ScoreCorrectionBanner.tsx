import React from 'react';
import {
  correctionModeBannerBlockedStyle,
  correctionModeBannerStyle,
} from './scoreCorrectionStyles';

interface ScoreCorrectionBannerProps {
  message: string | null;
  allowed: boolean;
}

export const ScoreCorrectionBanner: React.FC<ScoreCorrectionBannerProps> = ({ message, allowed }) => {
  if (!message) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      style={allowed ? correctionModeBannerStyle : correctionModeBannerBlockedStyle}
    >
      {message}
    </div>
  );
};

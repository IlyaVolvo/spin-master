import { APP_NAME } from '../brand';

type SmashWhizzLogoProps = {
  variant?: 'header' | 'about';
};

export function SmashWhizzLogo({ variant = 'header' }: SmashWhizzLogoProps) {
  return (
    <span
      className={`smashwhizz-mark${variant === 'about' ? ' smashwhizz-mark--about' : ''}`}
      role="img"
      aria-label={APP_NAME}
    >
      <span className="smashwhizz-table">
        <span className="smashwhizz-net" aria-hidden="true" />
        <span className="smashwhizz-left">
          Smas
          <span className="smashwhizz-h">h</span>
        </span>
        <span className="smashwhizz-right">Dash</span>
        <span className="smashwhizz-paddle smashwhizz-paddle--left app-header-paddle" aria-hidden="true">
          🏓
        </span>
        <span className="smashwhizz-paddle smashwhizz-paddle--right app-header-paddle" aria-hidden="true">
          🏓
        </span>
      </span>
    </span>
  );
}

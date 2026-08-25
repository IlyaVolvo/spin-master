import React, { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import '../styles/collapsible-actions.css';

export type CollapsibleActionButton = {
  type?: 'button';
  key: string;
  label: ReactNode;
  title?: string;
  ariaLabel?: string;
  onClick: () => void;
  className?: string;
  style?: CSSProperties;
  /** Included in overflow measurement when endSlot is omitted from the probe row. */
  measureClassName?: string;
  measureStyle?: CSSProperties;
  /** Highlight as the screen’s current selection in the overflow menu. */
  active?: boolean;
};

export type CollapsibleAction =
  | CollapsibleActionButton
  | {
      type: 'separator';
      key: string;
    };

type CollapsibleActionsProps = {
  items?: CollapsibleAction[];
  endSlot?: ReactNode;
  endMenuItems?: CollapsibleActionButton[];
  /** Replaces the default visible button row (e.g. app header controls). */
  visibleSlot?: ReactNode;
  /** Hidden row used for width measurement when visibleSlot is set. */
  measureSlot?: ReactNode;
  /** Menu entries when collapsed; defaults to items + endMenuItems. */
  allMenuItems?: CollapsibleActionButton[];
  menuLabel?: string;
  menuButtonRef?: React.MutableRefObject<HTMLButtonElement | null>;
  variant?: 'default' | 'header';
};

function isButton(item: CollapsibleAction): item is CollapsibleActionButton {
  return item.type !== 'separator';
}

function measureAvailableWidth(host: HTMLElement): number {
  const toolbar = host.closest('[data-collapsible-actions-boundary]') as HTMLElement | null;
  if (!toolbar) return host.clientWidth;

  const card = toolbar.closest('.card') as HTMLElement | null;
  const header = toolbar.closest('.header') as HTMLElement | null;
  const widthSource = card ?? header ?? toolbar;
  const sourceStyle = getComputedStyle(widthSource);
  const innerWidth = widthSource.clientWidth
    - (Number.parseFloat(sourceStyle.paddingLeft) || 0)
    - (Number.parseFloat(sourceStyle.paddingRight) || 0);

  const toolbarStyle = getComputedStyle(toolbar);
  const gap = Number.parseFloat(toolbarStyle.columnGap || toolbarStyle.gap || '0') || 0;

  let siblingWidth = 0;
  let siblingCount = 0;
  for (const child of toolbar.children) {
    if (child === host) continue;
    siblingWidth += (child as HTMLElement).offsetWidth;
    siblingCount += 1;
  }

  return Math.max(0, innerWidth - siblingWidth - siblingCount * gap);
}

function ActionRow({
  items,
  endButtons,
  renderButton,
}: {
  items: CollapsibleAction[];
  endButtons?: CollapsibleActionButton[];
  renderButton: (item: CollapsibleActionButton) => ReactNode;
}) {
  return (
    <>
      {items.length > 0 ? (
        <div className="collapsible-actions__center">
          {items.map((item) => {
            if (!isButton(item)) {
              return (
                <span key={item.key} className="collapsible-actions__separator" aria-hidden="true">
                  |
                </span>
              );
            }
            return renderButton(item);
          })}
        </div>
      ) : null}
      {endButtons && endButtons.length > 0 ? (
        <div className="collapsible-actions__end">
          {endButtons.map((item) => renderButton(item))}
        </div>
      ) : null}
    </>
  );
}

export function CollapsibleActions({
  items = [],
  endSlot,
  endMenuItems = [],
  visibleSlot,
  measureSlot,
  allMenuItems,
  menuLabel = 'Actions',
  menuButtonRef,
  variant = 'default',
}: CollapsibleActionsProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const measureRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const localMenuBtnRef = useRef<HTMLButtonElement | null>(null);
  const menuBtnRef = menuButtonRef ?? localMenuBtnRef;
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; right: number } | null>(null);

  const usesVisibleSlot = Boolean(visibleSlot);
  const hasCenter = !usesVisibleSlot && items.length > 0;
  const hasEnd = !usesVisibleSlot && (Boolean(endSlot) || endMenuItems.length > 0);
  const collapsedMenuItems = allMenuItems ?? [
    ...items.filter(isButton),
    ...endMenuItems,
  ];

  const renderVisibleButton = (item: CollapsibleActionButton) => (
    <button
      key={item.key}
      type="button"
      className={item.className}
      style={item.style}
      title={item.title}
      aria-label={item.ariaLabel}
      onClick={item.onClick}
    >
      {item.label}
    </button>
  );

  const renderMeasureButton = (item: CollapsibleActionButton) => (
    <button
      key={item.key}
      type="button"
      className={item.measureClassName ?? item.className}
      style={item.measureStyle ?? item.style}
      tabIndex={-1}
      aria-hidden="true"
      disabled
    >
      {item.label}
    </button>
  );

  useLayoutEffect(() => {
    const host = hostRef.current;
    const measure = measureRef.current;
    if (!host || !measure) return;

    const update = () => {
      const available = measureAvailableWidth(host);
      const needed = measure.scrollWidth;
      setCollapsed(needed > available + 1);
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    observer.observe(measure);
    const boundary = host.closest('[data-collapsible-actions-boundary]');
    if (boundary) observer.observe(boundary);
    const card = host.closest('.card');
    if (card) observer.observe(card);
    const header = host.closest('.header');
    if (header) observer.observe(header);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [items, endMenuItems, visibleSlot, measureSlot, allMenuItems]);

  useLayoutEffect(() => {
    if (!menuOpen) {
      setMenuPosition(null);
      return;
    }
    const updatePosition = () => {
      const rect = menuBtnRef.current?.getBoundingClientRect();
      if (!rect) return;
      setMenuPosition({
        top: rect.bottom + 4,
        right: Math.max(8, window.innerWidth - rect.right),
      });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [menuOpen, menuBtnRef]);

  useEffect(() => {
    if (!collapsed) setMenuOpen(false);
  }, [collapsed]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (menuBtnRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen, menuBtnRef]);

  if (!usesVisibleSlot && !hasCenter && !hasEnd) {
    return null;
  }

  const measureEndButtons = endMenuItems.length > 0
    ? endMenuItems
    : endSlot
      ? [{
          key: '__end-slot__',
          label: menuLabel,
          className: 'button-filter',
          style: { padding: '6px 12px', fontSize: '13px' } as CSSProperties,
          onClick: () => {},
        }]
      : [];

  const hostClassName = [
    'collapsible-actions',
    collapsed ? 'collapsible-actions--collapsed' : 'collapsible-actions--expanded',
    variant === 'header' ? 'collapsible-actions--header' : '',
  ].filter(Boolean).join(' ');

  const menuButtonClassName = variant === 'header'
    ? 'collapsible-actions__menu-btn collapsible-actions__menu-btn--header'
    : 'button-filter collapsible-actions__menu-btn';

  return (
    <div
      ref={hostRef}
      className={hostClassName}
      data-collapsible-actions
    >
      <div ref={measureRef} className="collapsible-actions__measure" aria-hidden="true">
        {measureSlot ?? (
          <div className="collapsible-actions__row">
            <ActionRow
              items={items}
              endButtons={measureEndButtons}
              renderButton={renderMeasureButton}
            />
          </div>
        )}
      </div>
      {!collapsed ? (
        visibleSlot ?? (
          <div className="collapsible-actions__row collapsible-actions__row--visible">
            <ActionRow items={items} renderButton={renderVisibleButton} />
            {endSlot ? <div className="collapsible-actions__end">{endSlot}</div> : null}
          </div>
        )
      ) : (
        <>
        {endSlot ? <div style={{ display: 'none' }}>{endSlot}</div> : null}
        <button
          ref={(el) => {
            menuBtnRef.current = el;
          }}
          type="button"
          className={menuButtonClassName}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuLabel}
          <span aria-hidden="true">{menuOpen ? '▲' : '▼'}</span>
        </button>
        </>
      )}
      {collapsed && menuOpen && menuPosition && createPortal(
        <div
          ref={menuRef}
          role="menu"
          data-collapsible-actions-menu
          className="collapsible-actions__menu"
          style={{
            position: 'fixed',
            top: menuPosition.top,
            right: menuPosition.right,
          }}
        >
          {collapsedMenuItems.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              className={[
                'collapsible-actions__menu-item',
                item.active ? 'collapsible-actions__menu-item--active' : '',
              ].filter(Boolean).join(' ')}
              title={item.title}
              aria-current={item.active ? 'page' : undefined}
              onClick={() => {
                item.onClick();
                setMenuOpen(false);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}

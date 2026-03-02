import React, { useEffect, useMemo, useRef, useState } from 'react';

export interface QuickJumpItem {
  id: string;
  label: string;
  meta?: string;
  keywords?: string;
  onSelect: () => void;
}

interface GlobalQuickJumpProps {
  items: QuickJumpItem[];
  placeholder?: string;
  ariaLabel?: string;
  maxResults?: number;
}

const GlobalQuickJump: React.FC<GlobalQuickJumpProps> = ({
  items,
  placeholder = 'Search and quick jump...',
  ariaLabel = 'Global search and quick jump',
  maxResults = 8,
}) => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const normalizedQuery = query.trim().toLowerCase();

  const filteredItems = useMemo(() => {
    if (!normalizedQuery) return [];
    return items
      .filter(item => {
        const haystack = `${item.label} ${item.meta || ''} ${item.keywords || ''}`.toLowerCase();
        return haystack.includes(normalizedQuery);
      })
      .slice(0, maxResults);
  }, [items, maxResults, normalizedQuery]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  const selectItem = (item: QuickJumpItem) => {
    item.onSelect();
    setQuery('');
    setIsOpen(false);
  };

  return (
    <div className="quick-jump" ref={rootRef}>
      <input
        type="search"
        className="input quick-jump-input"
        value={query}
        onChange={e => {
          setQuery(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={e => {
          if (e.key === 'Enter' && filteredItems[0]) {
            e.preventDefault();
            selectItem(filteredItems[0]);
          }
          if (e.key === 'Escape') {
            setIsOpen(false);
          }
        }}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        aria-controls="quick-jump-results"
      />
      {isOpen && normalizedQuery && (
        <div id="quick-jump-results" className="quick-jump-results" role="listbox">
          {filteredItems.length === 0 ? (
            <p className="quick-jump-empty">No matches found.</p>
          ) : (
            filteredItems.map(item => (
              <button
                key={item.id}
                type="button"
                className="quick-jump-result"
                onClick={() => selectItem(item)}
                role="option"
              >
                <span className="quick-jump-label">{item.label}</span>
                {item.meta && <span className="quick-jump-meta">{item.meta}</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default GlobalQuickJump;

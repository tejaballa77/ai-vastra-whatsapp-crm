'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Trash2 } from 'lucide-react';

interface BdmFilterDropdownProps {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  onDeleteName: (name: string) => void;
  title?: string;
  className?: string;
}

export default function BdmFilterDropdown({
  options,
  value,
  onChange,
  onDeleteName,
  title = 'Filter leads by BDM',
  className,
}: BdmFilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const [contextMenuFor, setContextMenuFor] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setContextMenuFor(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const handleSelect = (name: string) => {
    onChange(name);
    setOpen(false);
    setContextMenuFor(null);
  };

  const handleDelete = (name: string) => {
    onDeleteName(name);
    if (value === name) onChange('ALL');
    setContextMenuFor(null);
  };

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={
          className ||
          'px-3 py-2 bg-zinc-100 border border-zinc-300 rounded-xl text-xs font-extrabold text-black focus:outline-none focus:border-black min-w-[150px] flex items-center justify-between gap-2 cursor-pointer'
        }
        title={title}
      >
        <span className="truncate">{value === 'ALL' ? 'All BDMs' : value}</span>
        <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 min-w-[200px] max-h-64 overflow-y-auto bg-white border border-zinc-300 rounded-xl shadow-lg py-1">
          <div
            onClick={() => handleSelect('ALL')}
            className={`px-3 py-2 text-xs font-bold cursor-pointer hover:bg-zinc-100 ${value === 'ALL' ? 'bg-zinc-100' : ''}`}
          >
            All BDMs
          </div>
          {options.map((name) => (
            <div
              key={name}
              onClick={() => handleSelect(name)}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenuFor(name);
              }}
              className={`px-3 py-2 text-xs font-bold cursor-pointer hover:bg-zinc-100 flex items-center justify-between gap-2 ${value === name ? 'bg-zinc-100' : ''}`}
              title="Right-click to remove this name from the dropdown if it has no data"
            >
              <span className="truncate">{name}</span>
              {contextMenuFor === name && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(name);
                  }}
                  className="flex items-center gap-1 px-2 py-1 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-md text-[10px] font-extrabold flex-shrink-0 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  Delete
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

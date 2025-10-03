import { useState, useEffect, useRef, useMemo, type ReactNode } from 'react';
import { ChevronDown, Check, X } from 'lucide-react';

export interface DropdownOption {
  value: string;
  label: string;
  description?: string;
}

interface DropdownProps {
  value?: string | null;
  onChange: (value: string, option?: DropdownOption | null) => void;
  options: DropdownOption[];
  placeholder?: string;
  disabled?: boolean;
  label?: string;
  helperText?: string;
  description?: string;
  className?: string;
  buttonClassName?: string;
  size?: 'sm' | 'md';
  variant?: 'outline' | 'soft' | 'ghost';
  allowClear?: boolean;
  leadingIcon?: ReactNode;
  emptyMessage?: string;
}

export default function Dropdown({
  value = '',
  onChange,
  options,
  placeholder = 'Vyberte možnost',
  disabled = false,
  label,
  helperText,
  description,
  className,
  buttonClassName,
  size = 'md',
  variant = 'outline',
  allowClear = false,
  leadingIcon,
  emptyMessage = 'Žádné možnosti k výběru'
}: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = useMemo(() => options.find(option => option.value === value) ?? null, [options, value]);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        return;
      }

      if (event.key === 'Tab') {
        setIsOpen(false);
        return;
      }

      if (options.length === 0) return;

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex(prev => {
          const next = prev + 1;
          return next >= options.length ? 0 : next;
        });
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex(prev => {
          const next = prev - 1;
          return next < 0 ? options.length - 1 : next;
        });
      }

      if (event.key === 'Enter' && activeIndex >= 0) {
        event.preventDefault();
        const option = options[activeIndex];
        if (option) {
          onChange(option.value, option);
          setIsOpen(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeIndex, isOpen, onChange, options]);

  useEffect(() => {
    if (isOpen) {
      if (selectedOption) {
        const index = options.findIndex(option => option.value === selectedOption.value);
        setActiveIndex(index);
      } else {
        setActiveIndex(options.length > 0 ? 0 : -1);
      }
    }
  }, [isOpen, options, selectedOption]);

  const toggleOpen = () => {
    if (disabled) return;
    setIsOpen(prev => !prev);
  };

  const handleSelect = (option: DropdownOption) => {
    onChange(option.value, option);
    setIsOpen(false);
  };

  const handleClear = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onChange('', null);
    setIsOpen(false);
  };

  const sizeClasses = size === 'sm' ? 'px-3 py-2 pr-8 text-sm' : 'px-4 py-3 pr-10 text-base';
  const variantClasses =
    variant === 'soft'
      ? 'border border-slate-200 bg-slate-50 hover:border-slate-300'
      : variant === 'ghost'
      ? 'border border-transparent bg-transparent hover:bg-slate-100/70'
      : 'border border-slate-200 bg-white hover:border-[#0a192f]';

  const baseButtonClasses = [
    'relative w-full rounded-lg text-left text-slate-700 transition focus:outline-none focus:ring-2 focus:ring-[#0a192f]/20 focus:border-[#0a192f]',
    sizeClasses,
    variantClasses,
    disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
  ]
    .filter(Boolean)
    .join(' ');

  const combinedButtonClasses = [baseButtonClasses, buttonClassName].filter(Boolean).join(' ');

  return (
    <div ref={containerRef} className={['relative', className].filter(Boolean).join(' ')}>
      {label && (
        <div className="mb-1">
          <p className="text-sm font-medium text-slate-700">{label}</p>
          {description && <p className="text-xs text-slate-500">{description}</p>}
        </div>
      )}

      <button
        type="button"
        className={combinedButtonClasses}
        onClick={toggleOpen}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-3">
          {leadingIcon ? <span className="text-slate-400">{leadingIcon}</span> : null}
          <span className={`flex-1 truncate ${selectedOption ? 'text-slate-900' : 'text-slate-500'}`}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </div>
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
          <ChevronDown className="h-4 w-4" />
        </span>
      </button>

      {allowClear && selectedOption ? (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-8 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-600"
          aria-label="Vymazat výběr"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}

      {isOpen ? (
        <div
          role="listbox"
          className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
        >
          {options.length === 0 ? (
            <div className="px-4 py-3 text-sm text-slate-500">{emptyMessage}</div>
          ) : (
            options.map((option, index) => {
              const isSelected = selectedOption?.value === option.value;
              const isActive = index === activeIndex;
              return (
                <button
                  type="button"
                  key={option.value}
                  className={`flex w-full items-start gap-3 px-4 py-2 text-left text-sm transition ${
                    isActive ? 'bg-slate-100' : 'hover:bg-slate-50'
                  } ${isSelected ? 'text-[#0a192f] font-medium' : 'text-slate-700'}`}
                  onClick={() => handleSelect(option)}
                  role="option"
                  aria-selected={isSelected}
                >
                  <span className="flex h-5 w-5 items-center justify-center">
                    {isSelected ? <Check className="h-4 w-4" /> : null}
                  </span>
                  <span className="flex-1">
                    <span className="block text-sm leading-5">{option.label}</span>
                    {option.description ? (
                      <span className="block text-xs text-slate-500">{option.description}</span>
                    ) : null}
                  </span>
                </button>
              );
            })
          )}
        </div>
      ) : null}

      {helperText ? <p className="mt-1 text-xs text-slate-500">{helperText}</p> : null}
    </div>
  );
}

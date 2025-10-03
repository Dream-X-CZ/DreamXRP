import { useMemo } from 'react';
import { Clock } from 'lucide-react';
import Dropdown, { type DropdownOption } from './Dropdown';

interface TimePickerProps {
  value: string;
  onChange: (value: string) => void;
  minuteStep?: number;
  label?: string;
  helperText?: string;
  placeholder?: string;
  className?: string;
}

export default function TimePicker({
  value,
  onChange,
  minuteStep = 15,
  label,
  helperText,
  placeholder = 'Vyberte čas',
  className
}: TimePickerProps) {
  const options = useMemo<DropdownOption[]>(() => {
    const items: DropdownOption[] = [];
    for (let hour = 0; hour < 24; hour += 1) {
      for (let minute = 0; minute < 60; minute += minuteStep) {
        const hours = String(hour).padStart(2, '0');
        const minutes = String(minute).padStart(2, '0');
        const labelValue = `${hours}:${minutes}`;
        items.push({ value: labelValue, label: labelValue });
      }
    }
    return items;
  }, [minuteStep]);

  return (
    <div className={className}>
      <Dropdown
        value={value}
        onChange={nextValue => onChange(nextValue)}
        options={options}
        placeholder={placeholder}
        allowClear
        label={label}
        helperText={helperText}
        leadingIcon={<Clock className="h-4 w-4 text-slate-400" />}
      />
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  EllipsisHorizontalIcon
} from '@heroicons/react/20/solid';
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { supabase } from '../lib/supabase';
import { ensureUserOrganization } from '../lib/organization';
import type { CalendarEvent } from '../types/database';

interface CalendarProps {
  activeOrganizationId: string | null;
}

type DayCell = {
  date: string;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  events: CalendarEvent[];
};

const WEEKDAY_LABELS = [
  { short: 'M', long: 'on' },
  { short: 'T', long: 'ue' },
  { short: 'W', long: 'ed' },
  { short: 'T', long: 'hu' },
  { short: 'F', long: 'ri' },
  { short: 'S', long: 'at' },
  { short: 'S', long: 'un' }
];

function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
}

function toTitleCase(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function Calendar({ activeOrganizationId }: CalendarProps) {
  const [currentDate, setCurrentDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const todayKey = useMemo(() => formatDateKey(new Date()), []);
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const monthFormatter = useMemo(
    () => new Intl.DateTimeFormat('cs-CZ', { month: 'long', year: 'numeric' }),
    []
  );
  const dayDetailFormatter = useMemo(
    () => new Intl.DateTimeFormat('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' }),
    []
  );
  const timeFormatter = useMemo(
    () => new Intl.DateTimeFormat('cs-CZ', { hour: '2-digit', minute: '2-digit' }),
    []
  );

  const calendarRange = useMemo(() => {
    const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const startDay = (startOfMonth.getDay() + 6) % 7;
    const rangeStart = new Date(startOfMonth);
    rangeStart.setDate(startOfMonth.getDate() - startDay);
    const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    const totalDays = endOfMonth.getDate();
    const totalCells = Math.ceil((startDay + totalDays) / 7) * 7;
    const rangeEnd = new Date(rangeStart);
    rangeEnd.setDate(rangeStart.getDate() + totalCells);

    return { rangeStart, rangeEnd, totalCells };
  }, [currentDate]);

  const rangeStartTime = calendarRange.rangeStart.getTime();
  const rangeEndTime = calendarRange.rangeEnd.getTime();

  useEffect(() => {
    let isActive = true;

    const loadEvents = async () => {
      setLoading(true);
      setError(null);

      try {
        const {
          data: { user }
        } = await supabase.auth.getUser();

        if (!user) {
          if (isActive) {
            setEvents([]);
          }
          return;
        }

        const organizationId = await ensureUserOrganization(user.id, activeOrganizationId);
        if (!isActive) return;

        const startISO = new Date(rangeStartTime).toISOString();
        const endISO = new Date(rangeEndTime).toISOString();

        const { data, error: eventsError } = await supabase
          .from('calendar_events')
          .select(
            'id, organization_id, title, description, start_at, end_at, type, task_id, created_at, updated_at'
          )
          .eq('organization_id', organizationId)
          .gte('start_at', startISO)
          .lt('start_at', endISO)
          .order('start_at', { ascending: true })
          .returns<CalendarEvent[]>();

        if (eventsError) {
          throw eventsError;
        }

        if (isActive) {
          setEvents(data ?? []);
        }
      } catch (err) {
        console.error('Error loading calendar events:', err);
        if (isActive) {
          setError('Nepodařilo se načíst události kalendáře.');
          setEvents([]);
        }
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    };

    loadEvents();

    return () => {
      isActive = false;
    };
  }, [activeOrganizationId, rangeStartTime, rangeEndTime]);

  useEffect(() => {
    setSelectedDate(prev => {
      const fallback = formatDateKey(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1));

      if (!prev) {
        return fallback;
      }

      const previousDate = parseDateKey(prev);

      if (
        previousDate.getFullYear() === currentDate.getFullYear() &&
        previousDate.getMonth() === currentDate.getMonth()
      ) {
        return prev;
      }

      return fallback;
    });
  }, [currentDate]);

  const eventsByDate = useMemo(() => {
    const grouped: Record<string, CalendarEvent[]> = {};

    events.forEach(event => {
      const dateKey = formatDateKey(new Date(event.start_at));
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(event);
    });

    Object.values(grouped).forEach(list => {
      list.sort(
        (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
      );
    });

    return grouped;
  }, [events]);

  const days: DayCell[] = useMemo(() => {
    const dayCells: DayCell[] = [];

    for (let i = 0; i < calendarRange.totalCells; i += 1) {
      const dayDate = new Date(calendarRange.rangeStart);
      dayDate.setDate(calendarRange.rangeStart.getDate() + i);
      const dateKey = formatDateKey(dayDate);

      dayCells.push({
        date: dateKey,
        isCurrentMonth: dayDate.getMonth() === currentDate.getMonth(),
        isToday: dateKey === todayKey,
        isSelected: dateKey === selectedDate,
        events: eventsByDate[dateKey] ?? []
      });
    }

    return dayCells;
  }, [calendarRange, currentDate, eventsByDate, selectedDate, todayKey]);

  const selectedEvents = useMemo(
    () => (eventsByDate[selectedDate] ? [...eventsByDate[selectedDate]] : []),
    [eventsByDate, selectedDate]
  );

  const currentMonthLabel = useMemo(
    () => toTitleCase(monthFormatter.format(currentDate)),
    [currentDate, monthFormatter]
  );

  const currentMonthValue = useMemo(
    () => `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`,
    [currentDate]
  );

  const selectedDateLabel = useMemo(() => {
    if (!selectedDate) return '';
    const label = dayDetailFormatter.format(parseDateKey(selectedDate));
    return toTitleCase(label);
  }, [dayDetailFormatter, selectedDate]);

  const formatTime = (isoString: string) => timeFormatter.format(new Date(isoString));

  const formatEventTimeRange = (event: CalendarEvent) => {
    const start = timeFormatter.format(new Date(event.start_at));
    const end = timeFormatter.format(new Date(event.end_at));
    return `${start} – ${end}`;
  };

  const handlePreviousMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const handleToday = () => {
    const now = new Date();
    setCurrentDate(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDate(formatDateKey(now));
  };

  const handleSelectDate = (dateKey: string) => {
    setSelectedDate(dateKey);
  };

  return (
    <div className="lg:flex lg:h-full lg:flex-col">
      <header className="flex items-center justify-between border-b border-gray-200 px-6 py-4 lg:flex-none">
        <h1 className="text-base font-semibold text-gray-900">
          <time dateTime={currentMonthValue}>{currentMonthLabel}</time>
        </h1>
        <div className="flex items-center">
          <div className="relative flex items-center rounded-md bg-white shadow-xs outline -outline-offset-1 outline-gray-300 md:items-stretch">
            <button
              type="button"
              onClick={handlePreviousMonth}
              className="flex h-9 w-12 items-center justify-center rounded-l-md pr-1 text-gray-400 hover:text-gray-500 focus:relative md:w-9 md:pr-0 md:hover:bg-gray-50"
            >
              <span className="sr-only">Předchozí měsíc</span>
              <ChevronLeftIcon aria-hidden="true" className="size-5" />
            </button>
            <button
              type="button"
              onClick={handleToday}
              className="hidden px-3.5 text-sm font-semibold text-gray-900 hover:bg-gray-50 focus:relative md:block"
            >
              Dnes
            </button>
            <span className="relative -mx-px h-5 w-px bg-gray-300 md:hidden" />
            <button
              type="button"
              onClick={handleNextMonth}
              className="flex h-9 w-12 items-center justify-center rounded-r-md pl-1 text-gray-400 hover:text-gray-500 focus:relative md:w-9 md:pl-0 md:hover:bg-gray-50"
            >
              <span className="sr-only">Další měsíc</span>
              <ChevronRightIcon aria-hidden="true" className="size-5" />
            </button>
          </div>
          <div className="hidden md:ml-4 md:flex md:items-center">
            <Menu as="div" className="relative">
              <MenuButton
                type="button"
                className="flex items-center gap-x-1.5 rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-xs inset-ring inset-ring-gray-300 hover:bg-gray-50"
              >
                Měsíční přehled
                <ChevronDownIcon aria-hidden="true" className="-mr-1 size-5 text-gray-400" />
              </MenuButton>

              <MenuItems
                transition
                className="absolute right-0 z-10 mt-3 w-36 origin-top-right overflow-hidden rounded-md bg-white shadow-lg outline-1 outline-black/5 transition data-closed:scale-95 data-closed:transform data-closed:opacity-0 data-enter:duration-100 data-enter:ease-out data-leave:duration-75 data-leave:ease-in"
              >
                <div className="py-1">
                  <MenuItem>
                    <span className="block px-4 py-2 text-sm text-gray-700 data-focus:bg-gray-100 data-focus:text-gray-900 data-focus:outline-hidden">
                      Denní přehled
                    </span>
                  </MenuItem>
                  <MenuItem>
                    <span className="block px-4 py-2 text-sm text-gray-700 data-focus:bg-gray-100 data-focus:text-gray-900 data-focus:outline-hidden">
                      Týdenní přehled
                    </span>
                  </MenuItem>
                  <MenuItem>
                    <span className="block px-4 py-2 text-sm text-gray-700 data-focus:bg-gray-100 data-focus:text-gray-900 data-focus:outline-hidden">
                      Měsíční přehled
                    </span>
                  </MenuItem>
                  <MenuItem>
                    <span className="block px-4 py-2 text-sm text-gray-700 data-focus:bg-gray-100 data-focus:text-gray-900 data-focus:outline-hidden">
                      Roční přehled
                    </span>
                  </MenuItem>
                </div>
              </MenuItems>
            </Menu>
            <div className="ml-6 h-6 w-px bg-gray-300" />
            <button
              type="button"
              className="ml-6 rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            >
              Přidat událost
            </button>
            {loading && <span className="ml-4 text-sm text-gray-500">Načítání…</span>}
          </div>
          <Menu as="div" className="relative ml-6 md:hidden">
            <MenuButton className="-mx-2 flex items-center rounded-full border border-transparent p-2 text-gray-400 hover:text-gray-500">
              <span className="sr-only">Otevřít menu</span>
              <EllipsisHorizontalIcon aria-hidden="true" className="size-5" />
            </MenuButton>

            <MenuItems
              transition
              className="absolute right-0 z-10 mt-3 w-36 origin-top-right divide-y divide-gray-100 overflow-hidden rounded-md bg-white shadow-lg outline-1 outline-black/5 transition data-closed:scale-95 data-closed:transform data-closed:opacity-0 data-enter:duration-100 data-enter:ease-out data-leave:duration-75 data-leave:ease-in"
            >
              <div className="py-1">
                <MenuItem>
                  <span className="block px-4 py-2 text-sm text-gray-700 data-focus:bg-gray-100 data-focus:text-gray-900 data-focus:outline-hidden">
                    Vytvořit událost
                  </span>
                </MenuItem>
              </div>
              <div className="py-1">
                <MenuItem>
                  <button
                    type="button"
                    onClick={handleToday}
                    className="block w-full px-4 py-2 text-left text-sm text-gray-700 data-focus:bg-gray-100 data-focus:text-gray-900 data-focus:outline-hidden"
                  >
                    Přejít na dnešek
                  </button>
                </MenuItem>
              </div>
              <div className="py-1">
                <MenuItem>
                  <span className="block px-4 py-2 text-sm text-gray-700 data-focus:bg-gray-100 data-focus:text-gray-900 data-focus:outline-hidden">
                    Denní přehled
                  </span>
                </MenuItem>
                <MenuItem>
                  <span className="block px-4 py-2 text-sm text-gray-700 data-focus:bg-gray-100 data-focus:text-gray-900 data-focus:outline-hidden">
                    Týdenní přehled
                  </span>
                </MenuItem>
                <MenuItem>
                  <span className="block px-4 py-2 text-sm text-gray-700 data-focus:bg-gray-100 data-focus:text-gray-900 data-focus:outline-hidden">
                    Měsíční přehled
                  </span>
                </MenuItem>
                <MenuItem>
                  <span className="block px-4 py-2 text-sm text-gray-700 data-focus:bg-gray-100 data-focus:text-gray-900 data-focus:outline-hidden">
                    Roční přehled
                  </span>
                </MenuItem>
              </div>
            </MenuItems>
          </Menu>
        </div>
      </header>
      {error && (
        <div className="px-6 py-2 text-sm text-red-600">{error}</div>
      )}
      <div className="shadow-sm ring-1 ring-black/5 lg:flex lg:flex-auto lg:flex-col">
        <div className="grid grid-cols-7 gap-px border-b border-gray-300 bg-gray-200 text-center text-xs/6 font-semibold text-gray-700 lg:flex-none">
          {WEEKDAY_LABELS.map(day => (
            <div key={day.long} className="flex justify-center bg-white py-2">
              <span>{day.short}</span>
              <span className="sr-only sm:not-sr-only">{day.long}</span>
            </div>
          ))}
        </div>
        <div className="flex bg-gray-200 text-xs/6 text-gray-700 lg:flex-auto">
          <div className="hidden w-full lg:grid lg:grid-cols-7 lg:grid-rows-6 lg:gap-px">
            {days.map(day => (
              <div
                key={day.date}
                data-is-today={day.isToday ? '' : undefined}
                data-is-current-month={day.isCurrentMonth ? '' : undefined}
                className="group relative bg-gray-50 px-3 py-2 text-gray-500 data-is-current-month:bg-white"
              >
                <time
                  dateTime={day.date}
                  className="relative group-not-data-is-current-month:opacity-75 in-data-is-today:flex in-data-is-today:size-6 in-data-is-today:items-center in-data-is-today:justify-center in-data-is-today:rounded-full in-data-is-today:bg-indigo-600 in-data-is-today:font-semibold in-data-is-today:text-white"
                >
                  {Number(day.date.split('-')[2])}
                </time>
                {day.events.length > 0 ? (
                  <ol className="mt-2">
                    {day.events.slice(0, 2).map(event => (
                      <li key={event.id}>
                        <div className="group flex">
                          <p className="flex-auto truncate font-medium text-gray-900 group-hover:text-indigo-600">
                            {event.title}
                          </p>
                          <time
                            dateTime={event.start_at}
                            className="ml-3 hidden flex-none text-gray-500 group-hover:text-indigo-600 xl:block"
                          >
                            {formatTime(event.start_at)}
                          </time>
                        </div>
                      </li>
                    ))}
                    {day.events.length > 2 ? (
                      <li className="text-gray-500">+ {day.events.length - 2} dalších</li>
                    ) : null}
                  </ol>
                ) : null}
              </div>
            ))}
          </div>
          <div className="isolate grid w-full grid-cols-7 grid-rows-6 gap-px lg:hidden">
            {days.map(day => (
              <button
                key={day.date}
                type="button"
                onClick={() => handleSelectDate(day.date)}
                data-is-today={day.isToday ? '' : undefined}
                data-is-selected={day.isSelected ? '' : undefined}
                data-is-current-month={day.isCurrentMonth ? '' : undefined}
                className="group relative flex h-14 flex-col px-3 py-2 not-data-is-current-month:bg-gray-50 not-data-is-selected:not-data-is-current-month:not-data-is-today:text-gray-500 hover:bg-gray-100 focus:z-10 data-is-current-month:bg-white not-data-is-selected:data-is-current-month:not-data-is-today:text-gray-900 data-is-current-month:hover:bg-gray-100 data-is-selected:font-semibold data-is-selected:text-white data-is-today:font-semibold not-data-is-selected:data-is-today:text-indigo-600"
              >
                <time
                  dateTime={day.date}
                  className="ml-auto group-not-data-is-current-month:opacity-75 in-data-is-selected:flex in-data-is-selected:size-6 in-data-is-selected:items-center in-data-is-selected:justify-center in-data-is-selected:rounded-full in-data-is-selected:not-in-data-is-today:bg-gray-900 in-data-is-selected:in-data-is-today:bg-indigo-600"
                >
                  {Number(day.date.split('-')[2])}
                </time>
                <span className="sr-only">{day.events.length} událostí</span>
                {day.events.length > 0 ? (
                  <span className="-mx-0.5 mt-auto flex flex-wrap-reverse">
                    {day.events.map(event => (
                      <span key={event.id} className="mx-0.5 mb-1 size-1.5 rounded-full bg-gray-400" />
                    ))}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="relative px-4 py-10 sm:px-6 lg:hidden">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">{selectedDateLabel || 'Vyberte den'}</h2>
          {loading && <span className="text-xs text-gray-500">Načítání…</span>}
        </div>
        <ol className="divide-y divide-gray-100 overflow-hidden rounded-lg bg-white text-sm shadow-sm outline-1 outline-black/5">
          {selectedEvents.length > 0 ? (
            selectedEvents.map(event => (
              <li key={event.id} className="group flex p-4 pr-6 focus-within:bg-gray-50 hover:bg-gray-50">
                <div className="flex-auto">
                  <p className="font-semibold text-gray-900">{event.title}</p>
                  <time dateTime={event.start_at} className="mt-2 flex items-center text-gray-700">
                    <ClockIcon aria-hidden="true" className="mr-2 size-5 text-gray-400" />
                    {formatEventTimeRange(event)}
                  </time>
                </div>
              </li>
            ))
          ) : (
            <li className="p-4 text-center text-sm text-gray-600">
              {loading ? 'Načítání událostí…' : 'Žádné události pro vybraný den.'}
            </li>
          )}
        </ol>
      </div>
    </div>
  );
}

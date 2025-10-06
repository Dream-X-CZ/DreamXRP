import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
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
import type { CalendarEvent, Expense, Project, Task } from '../types/database';

type CalendarEventSource = 'calendar' | 'task' | 'project' | 'expense';

type EnrichedCalendarEvent = CalendarEvent & {
  source: CalendarEventSource;
  allDay?: boolean;
  metadata?: Record<string, string | number | boolean | null | undefined>;
};

type CalendarDayEvent = {
  event: EnrichedCalendarEvent;
  occurrenceDate: string;
  isFirstDay: boolean;
  isLastDay: boolean;
};

interface CalendarProps {
  activeOrganizationId: string | null;
}

type DayCell = {
  date: string;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  events: CalendarDayEvent[];
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

function normalizeStartOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function isMidnight(date: Date): boolean {
  return (
    date.getHours() === 0 &&
    date.getMinutes() === 0 &&
    date.getSeconds() === 0 &&
    date.getMilliseconds() === 0
  );
}

function inferAllDay(startISO: string, endISO: string): boolean {
  const start = new Date(startISO);
  const end = new Date(endISO);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return false;
  }

  const duration = end.getTime() - start.getTime();
  const isMultiDay = duration >= 24 * 60 * 60 * 1000;

  return isMidnight(start) && isMidnight(end) && (duration === 0 || isMultiDay);
}

function doesEventOverlapRange(
  event: EnrichedCalendarEvent,
  rangeStart: Date,
  rangeEndExclusive: Date
): boolean {
  const eventStart = new Date(event.start_at);
  const eventEnd = new Date(event.end_at);

  if (Number.isNaN(eventStart.getTime()) || Number.isNaN(eventEnd.getTime())) {
    return false;
  }

  if (eventEnd.getTime() < eventStart.getTime()) {
    return false;
  }

  return eventEnd.getTime() > rangeStart.getTime() && eventStart.getTime() < rangeEndExclusive.getTime();
}

function getEventOccurrences(event: EnrichedCalendarEvent): CalendarDayEvent[] {
  const occurrences: CalendarDayEvent[] = [];
  const eventStart = new Date(event.start_at);
  const eventEnd = new Date(event.end_at);

  if (Number.isNaN(eventStart.getTime()) || Number.isNaN(eventEnd.getTime())) {
    return occurrences;
  }

  const startDay = normalizeStartOfDay(eventStart);
  const tentativeEndDay = normalizeStartOfDay(eventEnd);
  const endDay = isMidnight(eventEnd) && eventEnd.getTime() > eventStart.getTime()
    ? addDays(tentativeEndDay, -1)
    : tentativeEndDay;

  if (endDay.getTime() < startDay.getTime()) {
    return [
      {
        event,
        occurrenceDate: formatDateKey(startDay),
        isFirstDay: true,
        isLastDay: true
      }
    ];
  }

  for (
    let cursor = new Date(startDay), index = 0;
    cursor.getTime() <= endDay.getTime();
    cursor.setDate(cursor.getDate() + 1), index += 1
  ) {
    const currentDateKey = formatDateKey(cursor);
    occurrences.push({
      event,
      occurrenceDate: currentDateKey,
      isFirstDay: index === 0,
      isLastDay: cursor.getTime() === endDay.getTime()
    });
  }

  return occurrences;
}

const SOURCE_LABELS: Record<CalendarEventSource, string> = {
  calendar: 'Událost',
  task: 'Úkol',
  project: 'Projekt',
  expense: 'Výdaj'
};

const SOURCE_ACCENT_CLASSES: Record<CalendarEventSource, string> = {
  calendar: 'bg-indigo-500',
  task: 'bg-emerald-500',
  project: 'bg-sky-500',
  expense: 'bg-amber-500'
};

const TASK_STATUS_LABELS: Record<Task['status'], string> = {
  todo: 'Plánováno',
  in_progress: 'Probíhá',
  completed: 'Dokončeno',
  cancelled: 'Zrušeno'
};

const TASK_PRIORITY_LABELS: Record<Task['priority'], string> = {
  low: 'Nízká',
  medium: 'Střední',
  high: 'Vysoká',
  urgent: 'Kritická'
};

const PROJECT_STATUS_LABELS: Record<Project['status'], string> = {
  planning: 'Plánování',
  active: 'Aktivní',
  completed: 'Dokončeno',
  'on-hold': 'Pozastaveno',
  cancelled: 'Zrušeno'
};

function getEventAccentClass(source: CalendarEventSource): string {
  return SOURCE_ACCENT_CLASSES[source] ?? SOURCE_ACCENT_CLASSES.calendar;
}

function getSourceLabel(source: CalendarEventSource): string {
  return SOURCE_LABELS[source] ?? SOURCE_LABELS.calendar;
}

function createProjectEvent(project: Project, organizationId: string): EnrichedCalendarEvent | null {
  const hasStart = Boolean(project.start_date);
  const hasEnd = Boolean(project.end_date);

  if (!hasStart && !hasEnd) {
    return null;
  }

  const startDate = project.start_date ? normalizeStartOfDay(new Date(project.start_date)) : null;
  const endDate = project.end_date ? normalizeStartOfDay(new Date(project.end_date)) : null;

  let timelineStart: Date | null = startDate;
  let timelineEnd: Date | null = endDate;

  if (!timelineStart && timelineEnd) {
    timelineStart = new Date(timelineEnd);
  }

  if (!timelineEnd && timelineStart) {
    timelineEnd = new Date(timelineStart);
  }

  if (!timelineStart || !timelineEnd) {
    return null;
  }

  if (timelineEnd.getTime() < timelineStart.getTime()) {
    timelineEnd = new Date(timelineStart);
  }

  const endExclusive = addDays(timelineEnd, 1);

  return {
    id: `project-${project.id}`,
    organization_id: organizationId,
    title: `Projekt: ${project.name}`,
    description: project.description ?? project.notes ?? null,
    start_at: timelineStart.toISOString(),
    end_at: endExclusive.toISOString(),
    type: 'project',
    task_id: null,
    created_at: project.created_at,
    updated_at: project.updated_at,
    source: 'project',
    allDay: true,
    metadata: {
      status: project.status,
      startDate: project.start_date ?? null,
      endDate: project.end_date ?? null
    }
  };
}

function createTaskEvent(
  task: Task,
  organizationId: string,
  projectMap: Map<string, Project>
): EnrichedCalendarEvent | null {
  if (!task.deadline) {
    return null;
  }

  const deadline = new Date(task.deadline);
  if (Number.isNaN(deadline.getTime())) {
    return null;
  }

  const hasSpecificTime = task.deadline.includes('T');
  const start = new Date(deadline);
  let end = new Date(deadline);

  if (hasSpecificTime) {
    end.setHours(end.getHours() + 1);
  } else {
    start.setHours(0, 0, 0, 0);
    end = addDays(start, 1);
  }

  const project = task.project_id ? projectMap.get(task.project_id) : undefined;

  return {
    id: `task-${task.id}`,
    organization_id: organizationId,
    title: task.title,
    description: task.description ?? null,
    start_at: start.toISOString(),
    end_at: end.toISOString(),
    type: 'task-deadline',
    task_id: task.id,
    created_at: task.created_at,
    updated_at: task.updated_at,
    source: 'task',
    allDay: !hasSpecificTime,
    metadata: {
      status: task.status,
      priority: task.priority,
      projectName: project?.name ?? null
    }
  };
}

function createExpenseEvent(expense: Expense, organizationId: string): EnrichedCalendarEvent | null {
  if (!expense.date) {
    return null;
  }

  const expenseDate = new Date(expense.date);
  if (Number.isNaN(expenseDate.getTime())) {
    return null;
  }

  const start = normalizeStartOfDay(expenseDate);
  const end = addDays(start, 1);

  return {
    id: `expense-${expense.id}`,
    organization_id: organizationId,
    title: `Výdaj: ${expense.name}`,
    description: expense.notes ?? null,
    start_at: start.toISOString(),
    end_at: end.toISOString(),
    type: 'expense',
    task_id: null,
    created_at: expense.created_at,
    updated_at: expense.date ?? expense.created_at,
    source: 'expense',
    allDay: true,
    metadata: {
      amount: expense.amount,
      isBillable: expense.is_billable,
      isBilled: expense.is_billed,
      projectId: expense.project_id ?? null,
      budgetId: expense.budget_id ?? null
    }
  };
}

export default function Calendar({ activeOrganizationId }: CalendarProps) {
  const [currentDate, setCurrentDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const todayKey = useMemo(() => formatDateKey(new Date()), []);
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [events, setEvents] = useState<EnrichedCalendarEvent[]>([]);
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

        const rangeStart = new Date(rangeStartTime);
        const rangeEndExclusive = new Date(rangeEndTime);
        const rangeStartISO = rangeStart.toISOString();
        const rangeEndISO = rangeEndExclusive.toISOString();
        const rangeStartDateKey = formatDateKey(rangeStart);
        const inclusiveRangeEnd = addDays(rangeEndExclusive, -1);
        const rangeEndDateKey = formatDateKey(inclusiveRangeEnd);

        const [calendarEventsRes, projectsRes, expensesRes] = await Promise.all([
          supabase
            .from('calendar_events')
            .select(
              'id, organization_id, title, description, start_at, end_at, type, task_id, created_at, updated_at'
            )
            .eq('organization_id', organizationId)
            .gte('end_at', rangeStartISO)
            .lt('start_at', rangeEndISO)
            .order('start_at', { ascending: true })
            .returns<CalendarEvent[]>(),
          supabase
            .from('projects')
            .select(
              'id, name, description, notes, start_date, end_date, status, created_at, updated_at'
            )
            .eq('organization_id', organizationId),
          supabase
            .from('expenses')
            .select(
              'id, name, amount, date, notes, project_id, budget_id, is_billable, is_billed, created_at'
            )
            .eq('organization_id', organizationId)
            .gte('date', rangeStartDateKey)
            .lte('date', rangeEndDateKey)
        ]);

        if (calendarEventsRes.error) throw calendarEventsRes.error;
        if (projectsRes.error) throw projectsRes.error;
        if (expensesRes.error) throw expensesRes.error;

        const projects = (projectsRes.data ?? []) as Project[];
        const projectMap = new Map(projects.map(project => [project.id, project]));
        const expenses = (expensesRes.data ?? []) as Expense[];

        let tasks: Task[] = [];

        if (projects.length > 0) {
          const projectIds = projects.map(project => project.id);
          const { data: taskRows, error: tasksError } = await supabase
            .from('tasks')
            .select(
              'id, title, description, status, priority, deadline, project_id, estimated_hours, actual_hours, created_at, updated_at'
            )
            .in('project_id', projectIds)
            .not('deadline', 'is', null);

          if (tasksError) throw tasksError;

          tasks = (taskRows ?? []).filter(task => {
            if (!task.deadline) return false;
            const deadlineDate = new Date(task.deadline);
            if (Number.isNaN(deadlineDate.getTime())) return false;
            return (
              deadlineDate.getTime() >= rangeStart.getTime() &&
              deadlineDate.getTime() < rangeEndExclusive.getTime()
            );
          });
        }

        if (!isActive) return;

        const combinedEvents: EnrichedCalendarEvent[] = [];

        const baseEvents = (calendarEventsRes.data ?? []).map(event => ({
          ...event,
          source: 'calendar' as const,
          allDay: inferAllDay(event.start_at, event.end_at)
        }));

        combinedEvents.push(...baseEvents);

        const projectEvents = projects
          .map(project => createProjectEvent(project, organizationId))
          .filter((event): event is EnrichedCalendarEvent => Boolean(event))
          .filter(event => doesEventOverlapRange(event, rangeStart, rangeEndExclusive));

        combinedEvents.push(...projectEvents);

        const taskEvents = tasks
          .map(task => createTaskEvent(task, organizationId, projectMap))
          .filter((event): event is EnrichedCalendarEvent => Boolean(event))
          .filter(event => doesEventOverlapRange(event, rangeStart, rangeEndExclusive));

        combinedEvents.push(...taskEvents);

        const expenseEvents = expenses
          .map(expense => createExpenseEvent(expense, organizationId))
          .filter((event): event is EnrichedCalendarEvent => Boolean(event))
          .filter(event => doesEventOverlapRange(event, rangeStart, rangeEndExclusive));

        combinedEvents.push(...expenseEvents);

        combinedEvents.sort(
          (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
        );

        setEvents(combinedEvents);
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
    const grouped: Record<string, CalendarDayEvent[]> = {};

    events.forEach(event => {
      const occurrences = getEventOccurrences(event);
      occurrences.forEach(occurrence => {
        if (!grouped[occurrence.occurrenceDate]) {
          grouped[occurrence.occurrenceDate] = [];
        }
        grouped[occurrence.occurrenceDate].push(occurrence);
      });
    });

    Object.values(grouped).forEach(list => {
      list.sort((a, b) => {
        const startDiff =
          new Date(a.event.start_at).getTime() - new Date(b.event.start_at).getTime();
        if (startDiff !== 0) {
          return startDiff;
        }
        return a.event.title.localeCompare(b.event.title);
      });
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

  const getOccurrenceTimingLabel = (occurrence: CalendarDayEvent) => {
    const { event, isFirstDay, isLastDay } = occurrence;

    if (event.allDay) {
      if (isFirstDay && isLastDay) {
        return 'Celý den';
      }
      if (isFirstDay) {
        return 'Začíná';
      }
      if (isLastDay) {
        return 'Končí';
      }
      return 'Probíhá';
    }

    const start = new Date(event.start_at);
    const end = new Date(event.end_at);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return '';
    }

    if (isFirstDay && isLastDay) {
      return `${timeFormatter.format(start)} – ${timeFormatter.format(end)}`;
    }

    if (isFirstDay) {
      return `Od ${timeFormatter.format(start)}`;
    }

    if (isLastDay) {
      return `Do ${timeFormatter.format(end)}`;
    }

    return 'Pokračuje';
  };

  const getEventMetadataLabel = (occurrence: CalendarDayEvent) => {
    const { event } = occurrence;
    const metadata = event.metadata;

    if (!metadata) {
      return null;
    }

    if (event.source === 'task') {
      const details: string[] = [];
      if (typeof metadata.projectName === 'string' && metadata.projectName.trim()) {
        details.push(metadata.projectName);
      }
      if (typeof metadata.status === 'string' && TASK_STATUS_LABELS[metadata.status as Task['status']]) {
        details.push(`Stav: ${TASK_STATUS_LABELS[metadata.status as Task['status']]}`);
      }
      if (
        typeof metadata.priority === 'string' &&
        TASK_PRIORITY_LABELS[metadata.priority as Task['priority']]
      ) {
        details.push(`Priorita: ${TASK_PRIORITY_LABELS[metadata.priority as Task['priority']]}`);
      }
      return details.join(' • ') || null;
    }

    if (event.source === 'project') {
      const details: string[] = [];
      if (
        typeof metadata.status === 'string' &&
        PROJECT_STATUS_LABELS[metadata.status as Project['status']]
      ) {
        details.push(`Stav: ${PROJECT_STATUS_LABELS[metadata.status as Project['status']]}`);
      }
      if (typeof metadata.startDate === 'string' && typeof metadata.endDate === 'string') {
        details.push(`${metadata.startDate} – ${metadata.endDate}`);
      } else if (typeof metadata.startDate === 'string') {
        details.push(`Od ${metadata.startDate}`);
      } else if (typeof metadata.endDate === 'string') {
        details.push(`Do ${metadata.endDate}`);
      }
      return details.join(' • ') || null;
    }

    if (event.source === 'expense') {
      const details: string[] = [];
      if (typeof metadata.amount === 'number') {
        details.push(
          `Částka: ${metadata.amount.toLocaleString('cs-CZ', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
          })} Kč`
        );
      }
      if (metadata.isBillable) {
        details.push('Fakturovatelné');
      }
      if (metadata.isBilled) {
        details.push('Vyfakturováno');
      }
      return details.join(' • ') || null;
    }

    return null;
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

  const handleDayKeyDown = (event: KeyboardEvent<HTMLDivElement>, dateKey: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleSelectDate(dateKey);
    }
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
                role="button"
                tabIndex={0}
                aria-label={`Den ${Number(day.date.split('-')[2])}`}
                aria-pressed={day.isSelected}
                onClick={() => handleSelectDate(day.date)}
                onKeyDown={event => handleDayKeyDown(event, day.date)}
                data-is-today={day.isToday ? '' : undefined}
                data-is-current-month={day.isCurrentMonth ? '' : undefined}
                data-is-selected={day.isSelected ? '' : undefined}
                className="group relative cursor-pointer bg-gray-50 px-3 py-2 text-left text-gray-500 outline-none transition data-is-current-month:bg-white data-is-selected:ring-2 data-is-selected:ring-indigo-500 data-is-selected:ring-offset-2 data-is-selected:ring-offset-white"
              >
                <time
                  dateTime={day.date}
                  className="relative group-not-data-is-current-month:opacity-75 in-data-is-selected:flex in-data-is-selected:items-center in-data-is-selected:justify-center in-data-is-selected:rounded-full in-data-is-selected:bg-indigo-600 in-data-is-selected:px-2 in-data-is-selected:py-1 in-data-is-selected:text-sm in-data-is-selected:font-semibold in-data-is-selected:text-white in-data-is-today:flex in-data-is-today:size-6 in-data-is-today:items-center in-data-is-today:justify-center in-data-is-today:rounded-full in-data-is-today:bg-indigo-600 in-data-is-today:font-semibold in-data-is-today:text-white"
                >
                  {Number(day.date.split('-')[2])}
                </time>
                {day.events.length > 0 ? (
                  <ol className="mt-3 space-y-2">
                    {day.events.slice(0, 3).map(occurrence => {
                      const metadata = getEventMetadataLabel(occurrence);
                      return (
                        <li key={`${occurrence.event.id}-${occurrence.occurrenceDate}`} className="text-gray-700">
                          <div className="flex gap-2">
                            <span
                              aria-hidden="true"
                              className={`mt-1.5 h-1.5 w-1.5 flex-none rounded-full ${getEventAccentClass(occurrence.event.source)}`}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium text-gray-900 group-hover:text-indigo-600">
                                {occurrence.event.title}
                              </p>
                              <p className="text-xs text-gray-500">
                                {getSourceLabel(occurrence.event.source)} • {getOccurrenceTimingLabel(occurrence)}
                              </p>
                              {metadata ? (
                                <p className="text-xs text-gray-400">{metadata}</p>
                              ) : null}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                    {day.events.length > 3 ? (
                      <li className="text-xs font-medium text-gray-500">
                        + {day.events.length - 3} dalších
                      </li>
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
                    {day.events.map(occurrence => (
                      <span
                        key={`${occurrence.event.id}-${occurrence.occurrenceDate}`}
                        className={`mx-0.5 mb-1 size-1.5 rounded-full ${getEventAccentClass(occurrence.event.source)}`}
                      />
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
            selectedEvents.map(occurrence => {
              const { event } = occurrence;
              const metadata = getEventMetadataLabel(occurrence);
              return (
                <li
                  key={`${event.id}-${occurrence.occurrenceDate}`}
                  className="group flex items-start gap-3 p-4 pr-6 focus-within:bg-gray-50 hover:bg-gray-50"
                >
                  <span
                    aria-hidden="true"
                    className={`mt-1.5 h-2 w-2 flex-none rounded-full ${getEventAccentClass(event.source)}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-900">{event.title}</p>
                    <p className="text-xs uppercase tracking-wide text-gray-500">
                      {getSourceLabel(event.source)}
                    </p>
                    <time dateTime={event.start_at} className="mt-2 flex items-center text-gray-700">
                      <ClockIcon aria-hidden="true" className="mr-2 size-5 text-gray-400" />
                      {getOccurrenceTimingLabel(occurrence)}
                    </time>
                    {metadata ? (
                      <p className="mt-2 text-xs text-gray-500">{metadata}</p>
                    ) : null}
                    {event.description ? (
                      <p className="mt-2 text-sm text-gray-600">{event.description}</p>
                    ) : null}
                  </div>
                </li>
              );
            })
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

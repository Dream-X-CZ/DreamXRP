import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Edit3,
  ExternalLink,
  Filter,
  Loader2,
  Plus,
  RefreshCcw,
  Trash2
} from 'lucide-react';

import { supabase } from '../lib/supabase';
import { ensureUserOrganization } from '../lib/organization';
import type { CalendarEvent as CalendarEventRecord, Project, Task } from '../types/database';

type TaskWithProject = Task & { project?: Project | null };

type CalendarDisplayEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  source: 'calendar' | 'task';
  type?: string | null;
  description?: string | null;
  calendarEvent?: CalendarEventRecord;
  task?: TaskWithProject | null;
  allDay?: boolean;
};

type EventFormState = {
  title: string;
  description: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  type: string;
  task_id: string;
};

const initialFormState: EventFormState = {
  title: '',
  description: '',
  startDate: '',
  startTime: '',
  endDate: '',
  endTime: '',
  type: 'event',
  task_id: ''
};

const eventTypeOptions: { value: string; label: string }[] = [
  { value: 'event', label: 'Událost' },
  { value: 'meeting', label: 'Schůzka' },
  { value: 'milestone', label: 'Milník' },
  { value: 'deadline', label: 'Deadline' },
  { value: 'workshop', label: 'Workshop' },
  { value: 'other', label: 'Ostatní' }
];

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatTimeInput(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function ensureEndAfterStart(start: Date, end: Date) {
  if (end.getTime() <= start.getTime()) {
    const adjusted = new Date(start);
    adjusted.setHours(start.getHours() + 1);
    return adjusted;
  }
  return end;
}

function determineAllDay(start: Date, end: Date) {
  const startMidnight = start.getHours() === 0 && start.getMinutes() === 0;
  const endEndOfDay = end.getHours() === 23 && end.getMinutes() >= 55;
  const duration = end.getTime() - start.getTime();
  return startMidnight && endEndOfDay && duration >= 23 * 60 * 60 * 1000;
}

function startOfWeek(date: Date) {
  const result = new Date(date);
  const day = result.getDay();
  const diff = (day + 6) % 7; // convert Sunday (0) -> 6
  result.setDate(result.getDate() - diff);
  result.setHours(0, 0, 0, 0);
  return result;
}

function addDays(date: Date, amount: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

const dayFormatter = new Intl.DateTimeFormat('cs-CZ', {
  weekday: 'long',
  day: 'numeric',
  month: 'numeric'
});

const timeFormatter = new Intl.DateTimeFormat('cs-CZ', {
  hour: '2-digit',
  minute: '2-digit'
});

const dateTimeFormatter = new Intl.DateTimeFormat('cs-CZ', {
  day: 'numeric',
  month: 'numeric',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
});

const dateFormatter = new Intl.DateTimeFormat('cs-CZ', {
  day: 'numeric',
  month: 'numeric',
  year: 'numeric'
});

export default function Calendar() {
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEventRecord[]>([]);
  const [tasks, setTasks] = useState<TaskWithProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarDisplayEvent | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<EventFormState>(initialFormState);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEventRecord | null>(null);
  const [filters, setFilters] = useState({ calendar: true, tasks: true, type: 'all' as string });
  const [currentWeekStart, setCurrentWeekStart] = useState(() => startOfWeek(new Date()));

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) {
        setCalendarEvents([]);
        setTasks([]);
        setError('Pro práci s kalendářem musíte být přihlášeni.');
        setLoading(false);
        return;
      }

      const orgId = await ensureUserOrganization(user.id);
      setOrganizationId(orgId);

      const [calendarRes, tasksRes] = await Promise.all([
        supabase
          .from('calendar_events')
          .select('*, task:tasks(*, project:projects(*))')
          .eq('organization_id', orgId)
          .order('start_at', { ascending: true }),
        supabase
          .from('tasks')
          .select('*, project:projects(id, name, organization_id)')
          .not('deadline', 'is', null)
          .eq('project.organization_id', orgId)
      ]);

      if (calendarRes.error) throw calendarRes.error;
      if (tasksRes.error) throw tasksRes.error;

      setCalendarEvents((calendarRes.data as CalendarEventRecord[]) ?? []);
      setTasks((tasksRes.data as TaskWithProject[]) ?? []);
    } catch (err: any) {
      console.error('Error loading calendar data:', err);
      setError('Nepodařilo se načíst data kalendáře. Zkuste to prosím znovu.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const availableTypes = useMemo(() => {
    const typeSet = new Set<string>();

    calendarEvents.forEach(event => {
      if (event.type) {
        typeSet.add(event.type);
      }
    });

    if (tasks.length > 0) {
      typeSet.add('task_deadline');
    }

    return ['all', ...Array.from(typeSet)];
  }, [calendarEvents, tasks]);

  const tasksForSelect = useMemo(() => {
    const map = new Map<string, TaskWithProject>();
    tasks.forEach(task => {
      map.set(task.id, task);
    });

    if (editingEvent?.task && !map.has(editingEvent.task.id)) {
      map.set(editingEvent.task.id, editingEvent.task as TaskWithProject);
    }

    return Array.from(map.values());
  }, [tasks, editingEvent]);

  const displayedEvents = useMemo(() => {
    const items: CalendarDisplayEvent[] = [];

    if (filters.calendar) {
      for (const event of calendarEvents) {
        const start = new Date(event.start_at);
        const endRaw = new Date(event.end_at);

        if (Number.isNaN(start.getTime()) || Number.isNaN(endRaw.getTime())) {
          continue;
        }

        const end = ensureEndAfterStart(start, endRaw);
        const allDay = determineAllDay(start, end);

        items.push({
          id: event.id,
          title: event.title,
          start,
          end,
          source: 'calendar',
          type: event.type,
          description: event.description,
          calendarEvent: event,
          task: event.task ?? null,
          allDay
        });
      }
    }

    if (filters.tasks) {
      for (const task of tasks) {
        if (!task.deadline) continue;
        const start = new Date(task.deadline);
        if (Number.isNaN(start.getTime())) continue;

        const hasTime = task.deadline.includes('T');
        const end = new Date(start);

        if (hasTime) {
          end.setHours(end.getHours() + 1);
        } else {
          end.setHours(23, 59, 0, 0);
        }

        items.push({
          id: `task-${task.id}`,
          title: `${task.title} (deadline)`,
          start,
          end,
          source: 'task',
          type: 'task_deadline',
          description: task.description ?? null,
          task,
          allDay: !hasTime
        });
      }
    }

    return items.filter(event => filters.type === 'all' || event.type === filters.type);
  }, [calendarEvents, tasks, filters]);

  useEffect(() => {
    if (!selectedEvent) return;

    const stillExists = displayedEvents.some(event => event.id === selectedEvent.id);
    if (!stillExists) {
      setSelectedEvent(null);
    }
  }, [displayedEvents, selectedEvent]);

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, index) => addDays(currentWeekStart, index));
  }, [currentWeekStart]);

  const handleCreateNew = useCallback(() => {
    setEditingEvent(null);
    setFormData(initialFormState);
    setFormError(null);
    setShowForm(true);
  }, []);

  const handleEditEvent = useCallback((event: CalendarDisplayEvent) => {
    if (event.source !== 'calendar' || !event.calendarEvent) return;

    const start = new Date(event.calendarEvent.start_at);
    const end = new Date(event.calendarEvent.end_at);
    const allDay = event.allDay ?? false;

    setEditingEvent(event.calendarEvent);
    setFormError(null);
    setFormData({
      title: event.calendarEvent.title,
      description: event.calendarEvent.description ?? '',
      startDate: formatDateInput(start),
      startTime: allDay ? '' : formatTimeInput(start),
      endDate: formatDateInput(end),
      endTime: allDay ? '' : formatTimeInput(end),
      type: event.calendarEvent.type ?? 'event',
      task_id: event.calendarEvent.task_id ?? ''
    });
    setShowForm(true);
  }, []);

  const handleConvertTaskEvent = useCallback((event: CalendarDisplayEvent) => {
    if (!event.task) return;

    setEditingEvent(null);
    setFormError(null);
    setFormData({
      title: event.task.title,
      description: event.task.description ?? '',
      startDate: formatDateInput(event.start),
      startTime: event.allDay ? '' : formatTimeInput(event.start),
      endDate: formatDateInput(event.end),
      endTime: event.allDay ? '' : formatTimeInput(event.end),
      type: 'deadline',
      task_id: event.task.id
    });
    setShowForm(true);
  }, []);

  const handleCloseForm = useCallback(() => {
    setShowForm(false);
    setFormError(null);
    setFormData(initialFormState);
    setEditingEvent(null);
  }, []);

  useEffect(() => {
    if (!showForm) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [showForm]);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setFormError(null);

      if (!organizationId) {
        setFormError('Nepodařilo se načíst organizaci. Obnovte prosím stránku.');
        return;
      }

      if (!formData.title.trim()) {
        setFormError('Zadejte název události.');
        return;
      }

      if (!formData.startDate) {
        setFormError('Vyberte datum začátku události.');
        return;
      }

      const startDateTime = formData.startTime
        ? new Date(`${formData.startDate}T${formData.startTime}:00`)
        : new Date(`${formData.startDate}T00:00:00`);

      const endDateValue = formData.endDate || formData.startDate;
      const endDateTime = formData.endTime
        ? new Date(`${endDateValue}T${formData.endTime}:00`)
        : new Date(`${endDateValue}T23:59:00`);

      if (Number.isNaN(startDateTime.getTime()) || Number.isNaN(endDateTime.getTime())) {
        setFormError('Neplatný formát data nebo času.');
        return;
      }

      if (endDateTime.getTime() < startDateTime.getTime()) {
        setFormError('Konec události nemůže být před jejím začátkem.');
        return;
      }

      setSaving(true);

      const payload = {
        title: formData.title.trim(),
        description: formData.description.trim() ? formData.description.trim() : null,
        start_at: startDateTime.toISOString(),
        end_at: endDateTime.toISOString(),
        type: formData.type || 'event',
        task_id: formData.task_id ? formData.task_id : null
      };

      try {
        if (editingEvent) {
          const { error: updateError } = await supabase
            .from('calendar_events')
            .update({ ...payload, updated_at: new Date().toISOString() })
            .eq('id', editingEvent.id);

          if (updateError) throw updateError;
        } else {
          const { error: insertError } = await supabase.from('calendar_events').insert([
            {
              ...payload,
              organization_id: organizationId
            }
          ]);

          if (insertError) throw insertError;
        }

        await loadData();
        handleCloseForm();
      } catch (err: any) {
        console.error('Error saving calendar event:', err);
        setFormError('Nepodařilo se uložit událost. Zkuste to prosím znovu.');
      } finally {
        setSaving(false);
      }
    },
    [organizationId, formData, editingEvent, handleCloseForm, loadData]
  );

  const handleDeleteEvent = useCallback(
    async (event: CalendarDisplayEvent) => {
      if (event.source !== 'calendar' || !event.calendarEvent) return;
      if (!confirm(`Opravdu chcete smazat událost "${event.title}"?`)) return;

      try {
        const { error: deleteError } = await supabase
          .from('calendar_events')
          .delete()
          .eq('id', event.calendarEvent.id);

        if (deleteError) throw deleteError;

        setSelectedEvent(null);
        await loadData();
      } catch (err: any) {
        console.error('Error deleting calendar event:', err);
        alert('Událost se nepodařilo smazat.');
      }
    },
    [loadData]
  );

  const refreshButton = (
    <button
      onClick={loadData}
      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white text-[#0a192f] shadow hover:bg-slate-100 transition"
      title="Obnovit data"
    >
      <RefreshCcw className="w-4 h-4" />
      <span>Obnovit</span>
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0a192f] flex items-center gap-2">
            <CalendarIcon className="w-6 h-6" />
            Kalendář
          </h1>
          <p className="text-gray-600">Plánujte týmové události a sledujte termíny úkolů na jednom místě.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {refreshButton}
          <button
            onClick={handleCreateNew}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0a192f] text-white shadow hover:bg-[#0c2242] transition"
          >
            <Plus className="w-4 h-4" />
            <span>Nová událost</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between mb-4">
          <div className="flex items-center gap-2 text-sm text-gray-700">
            <Filter className="w-4 h-4 text-gray-500" />
            <span>Zdroj:</span>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={filters.calendar}
                onChange={event => setFilters(prev => ({ ...prev, calendar: event.target.checked }))}
              />
              Události
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={filters.tasks}
                onChange={event => setFilters(prev => ({ ...prev, tasks: event.target.checked }))}
              />
              Deadliny úkolů
            </label>
          </div>

          <div className="flex items-center gap-2 text-sm text-gray-700">
            <span>Typ:</span>
            <select
              value={filters.type}
              onChange={event => setFilters(prev => ({ ...prev, type: event.target.value }))}
              className="border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#0a192f]"
            >
              {availableTypes.map(option => (
                <option key={option} value={option}>
                  {option === 'all'
                    ? 'Vše'
                    : option === 'task_deadline'
                    ? 'Deadliny úkolů'
                    : eventTypeOptions.find(type => type.value === option)?.label ?? option}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 text-sm text-gray-700">
            <button
              onClick={() => setCurrentWeekStart(prev => addDays(prev, -7))}
              className="p-2 rounded-lg border border-slate-200 hover:bg-slate-100 transition"
              title="Předchozí týden"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-medium">
              {dateFormatter.format(currentWeekStart)} – {dateFormatter.format(addDays(currentWeekStart, 6))}
            </span>
            <button
              onClick={() => setCurrentWeekStart(prev => addDays(prev, 7))}
              className="p-2 rounded-lg border border-slate-200 hover:bg-slate-100 transition"
              title="Další týden"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[700px]">
            <div className="grid grid-cols-7 gap-3">
              {weekDays.map(day => {
                const dayEvents = displayedEvents
                  .filter(event => event.start.getFullYear() === day.getFullYear() && event.start.getMonth() === day.getMonth() && event.start.getDate() === day.getDate())
                  .sort((a, b) => a.start.getTime() - b.start.getTime());

                return (
                  <div key={day.toISOString()} className="border border-slate-200 rounded-lg p-3 bg-slate-50/60">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-[#0a192f] capitalize">
                        {dayFormatter.format(day)}
                      </span>
                      <span className="text-xs text-gray-500">{dayEvents.length} ud.</span>
                    </div>

                    <div className="space-y-2 min-h-[80px]">
                      {dayEvents.length === 0 && (
                        <p className="text-xs text-gray-500 bg-white border border-dashed border-slate-300 rounded-lg p-3 text-center">
                          Žádné události
                        </p>
                      )}

                      {dayEvents.map(event => (
                        <button
                          key={event.id}
                          onClick={() => setSelectedEvent(event)}
                          className={`w-full text-left p-3 rounded-lg border shadow-sm transition ${
                            event.source === 'task'
                              ? 'bg-blue-50 border-blue-100 hover:bg-blue-100'
                              : 'bg-cyan-50 border-cyan-100 hover:bg-cyan-100'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                              {event.source === 'task' ? 'Úkol' : 'Událost'}
                            </span>
                            {event.type && (
                              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/70 text-gray-600">
                                {event.type === 'task_deadline'
                                  ? 'Deadline'
                                  : eventTypeOptions.find(option => option.value === event.type)?.label ?? event.type}
                              </span>
                            )}
                          </div>
                          <p className="font-semibold text-[#0a192f] mt-1">{event.title}</p>
                          <p className="text-xs text-gray-600 mt-1">
                            {event.allDay
                              ? 'Celý den'
                              : `${timeFormatter.format(event.start)} – ${timeFormatter.format(event.end)}`}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {loading && (
          <div className="mt-6 flex items-center justify-center text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Načítání kalendáře…
          </div>
        )}

        {error && !loading && (
          <div className="mt-6 flex flex-col items-center justify-center text-center text-red-600">
            <p>{error}</p>
            <button
              onClick={loadData}
              className="mt-3 px-4 py-2 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 transition"
            >
              Zkusit znovu
            </button>
          </div>
        )}
      </div>

      {selectedEvent && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <span
                  className={`px-2.5 py-1 text-xs font-semibold rounded-full ${
                    selectedEvent.source === 'task'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-cyan-100 text-cyan-700'
                  }`}
                >
                  {selectedEvent.source === 'task' ? 'Úkol' : 'Událost'}
                </span>
                {selectedEvent.type && (
                  <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-slate-100 text-slate-600">
                    {selectedEvent.type === 'task_deadline'
                      ? 'Deadline úkolu'
                      : eventTypeOptions.find(option => option.value === selectedEvent.type)?.label ??
                        selectedEvent.type}
                  </span>
                )}
              </div>
              <h2 className="text-xl font-semibold text-[#0a192f] mt-3">{selectedEvent.title}</h2>
              <p className="text-sm text-gray-600 mt-2">
                {selectedEvent.allDay
                  ? `${dateFormatter.format(selectedEvent.start)} – ${dateFormatter.format(selectedEvent.end)}`
                  : `${dateTimeFormatter.format(selectedEvent.start)} – ${dateTimeFormatter.format(selectedEvent.end)}`}
              </p>

              {selectedEvent.description && (
                <p className="text-gray-700 mt-4 whitespace-pre-line">{selectedEvent.description}</p>
              )}

              {selectedEvent.task && (
                <div className="mt-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
                  <p className="text-sm text-gray-600">Propojený úkol</p>
                  <p className="font-medium text-[#0a192f] mt-1">{selectedEvent.task.title}</p>
                  {selectedEvent.task.project?.name && (
                    <p className="text-sm text-gray-600 mt-1">Projekt: {selectedEvent.task.project.name}</p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <a
                      href="#tasks"
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-sm text-[#0a192f] hover:bg-slate-100 transition"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Zobrazit v úkolech
                    </a>
                    {selectedEvent.source === 'task' && (
                      <button
                        onClick={() => handleConvertTaskEvent(selectedEvent)}
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0a192f] text-white text-sm hover:bg-[#0c2242] transition"
                      >
                        <Plus className="w-4 h-4" />
                        Vytvořit kalendářovou událost
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {selectedEvent.source === 'calendar' && (
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => handleEditEvent(selectedEvent)}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-sm text-[#0a192f] hover:bg-slate-100 transition"
                >
                  <Edit3 className="w-4 h-4" />
                  Upravit
                </button>
                <button
                  onClick={() => handleDeleteEvent(selectedEvent)}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-red-100 text-sm text-red-700 hover:bg-red-200 transition"
                >
                  <Trash2 className="w-4 h-4" />
                  Smazat
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4">
          <div className="bg-white w-full max-w-2xl rounded-xl shadow-lg border border-slate-200 p-6 relative">
            <h3 className="text-xl font-semibold text-[#0a192f] mb-4">
              {editingEvent ? 'Upravit událost' : 'Nová událost'}
            </h3>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <label className="block text-sm font-medium text-gray-700">Název</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={event => setFormData(prev => ({ ...prev, title: event.target.value }))}
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#0a192f]"
                  placeholder="Název události"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Popis</label>
                <textarea
                  value={formData.description}
                  onChange={event => setFormData(prev => ({ ...prev, description: event.target.value }))}
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#0a192f]"
                  rows={3}
                  placeholder="Detaily události"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Začátek</label>
                  <div className="mt-1 grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      value={formData.startDate}
                      onChange={event => setFormData(prev => ({ ...prev, startDate: event.target.value }))}
                      className="border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#0a192f]"
                      required
                    />
                    <input
                      type="time"
                      value={formData.startTime}
                      onChange={event => setFormData(prev => ({ ...prev, startTime: event.target.value }))}
                      className="border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#0a192f]"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Konec</label>
                  <div className="mt-1 grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      value={formData.endDate}
                      onChange={event => setFormData(prev => ({ ...prev, endDate: event.target.value }))}
                      className="border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#0a192f]"
                    />
                    <input
                      type="time"
                      value={formData.endTime}
                      onChange={event => setFormData(prev => ({ ...prev, endTime: event.target.value }))}
                      className="border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#0a192f]"
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Pokud konec nevyplníte, použije se datum začátku.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Typ události</label>
                  <select
                    value={formData.type}
                    onChange={event => setFormData(prev => ({ ...prev, type: event.target.value }))}
                    className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#0a192f]"
                  >
                    {eventTypeOptions.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Propojit s úkolem</label>
                  <select
                    value={formData.task_id}
                    onChange={event => setFormData(prev => ({ ...prev, task_id: event.target.value }))}
                    className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#0a192f]"
                  >
                    <option value="">Nepropojovat</option>
                    {tasksForSelect.map(task => (
                      <option key={task.id} value={task.id}>
                        {task.project?.name ? `${task.project.name} · ${task.title}` : task.title}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Propojením získáte rychlý přístup z detailu úkolu přímo na událost.
                  </p>
                </div>
              </div>

              {formError && <p className="text-sm text-red-600">{formError}</p>}

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={handleCloseForm}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-[#0a192f] hover:bg-slate-100 transition"
                >
                  Zavřít
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-[#0a192f] text-white hover:bg-[#0c2242] transition disabled:opacity-70"
                >
                  {saving ? 'Ukládám…' : editingEvent ? 'Uložit změny' : 'Vytvořit událost'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

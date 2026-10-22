import { useState, type FormEvent } from "react";
import { useTranslation } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CreateBookingTypeBody } from "../../api/calendar";

interface BookingTypeFormProps {
  pending: boolean;
  onSubmit: (body: CreateBookingTypeBody) => void;
  onCancel: () => void;
}

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0];
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Creates a booking type: duration, buffer, weekly hours and time zone. */
export function BookingTypeForm({ pending, onSubmit, onCancel }: BookingTypeFormProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [duration, setDuration] = useState("30");
  const [buffer, setBuffer] = useState("10");
  const [timezone, setTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("17:00");
  const [error, setError] = useState<string | null>(null);

  function toggleDay(day: number) {
    setDays((current) => (current.includes(day) ? current.filter((d) => d !== day) : [...current, day]));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const durationMinutes = Number(duration);
    const bufferMinutes = Number(buffer);
    if (!name.trim()) return setError(t("schedule.errors.name"));
    if (!SLUG_PATTERN.test(slug)) return setError(t("schedule.errors.slug"));
    if (!Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 480) {
      return setError(t("schedule.errors.duration"));
    }
    if (!Number.isInteger(bufferMinutes) || bufferMinutes < 0 || bufferMinutes > 240) {
      return setError(t("schedule.errors.buffer"));
    }
    if (days.length === 0 || start >= end) return setError(t("schedule.errors.hours"));
    setError(null);
    onSubmit({
      name: name.trim(),
      slug,
      durationMinutes,
      bufferMinutes,
      timezone,
      weeklyHours: days.sort((a, b) => a - b).map((weekday) => ({ weekday, start, end })),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-md border p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="booking-name">{t("schedule.typeName")}</Label>
          <Input id="booking-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="booking-slug">{t("schedule.typeSlug")}</Label>
          <Input id="booking-slug" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="booking-duration">{t("schedule.typeDuration")}</Label>
          <Input id="booking-duration" type="number" value={duration} onChange={(e) => setDuration(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="booking-buffer">{t("schedule.typeBuffer")}</Label>
          <Input id="booking-buffer" type="number" value={buffer} onChange={(e) => setBuffer(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="booking-timezone">{t("schedule.typeTimezone")}</Label>
          <Input id="booking-timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="booking-start">{t("schedule.typeStart")}</Label>
            <Input id="booking-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="booking-end">{t("schedule.typeEnd")}</Label>
            <Input id="booking-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t("schedule.typeDays")}</legend>
        <div className="flex flex-wrap gap-3">
          {WEEKDAYS.map((day) => (
            <label key={day} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={days.includes(day)} onChange={() => toggleDay(day)} />
              {t(`schedule.weekday.${day}`)}
            </label>
          ))}
        </div>
      </fieldset>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <div className="flex items-center justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("schedule.cancel")}
        </Button>
        <Button type="submit" disabled={pending}>
          {t("schedule.save")}
        </Button>
      </div>
    </form>
  );
}

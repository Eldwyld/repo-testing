/**
 * Reusable, accessible configuration controls. Every control is a labelled
 * native element so keyboard and screen-reader support come for free.
 */
import { ReactNode, useEffect, useId, useMemo, useState } from 'react';
import { formatIssues, validate, Validator } from '../core/validate';
import { scanValue, describeFindings } from '../content/guard';

export function Field({
  label,
  help,
  children,
  id,
}: {
  label: string;
  help?: string;
  children: ReactNode;
  id?: string;
}) {
  return (
    <div className='field'>
      <label htmlFor={id}>{label}</label>
      {children}
      {help && <span className='help'>{help}</span>}
    </div>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
  help,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  help?: string;
}) {
  return (
    <div className='field'>
      <label className='toggle'>
        <input
          type='checkbox'
          checked={checked}
          onChange={e => onChange(e.target.checked)}
        />
        <span>{label}</span>
      </label>
      {help && <span className='help'>{help}</span>}
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  help,
  placeholder,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  help?: string;
  placeholder?: string;
  multiline?: boolean;
}) {
  const id = useId();
  return (
    <Field label={label} help={help} id={id}>
      {multiline ? (
        <textarea
          id={id}
          className='prose'
          value={value}
          placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
        />
      ) : (
        <input
          id={id}
          type='text'
          value={value}
          placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
        />
      )}
    </Field>
  );
}

/** Numeric input that only commits finite values within bounds. */
export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  help,
  unit,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  help?: string;
  unit?: string;
}) {
  const id = useId();
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = (raw: string) => {
    setText(raw);
    const n = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(n)) return;
    if (min !== undefined && n < min) return;
    if (max !== undefined && n > max) return;
    onChange(n);
  };
  const invalid =
    text.trim() === '' ||
    !Number.isFinite(Number(text)) ||
    (min !== undefined && Number(text) < min) ||
    (max !== undefined && Number(text) > max);
  return (
    <Field
      label={unit ? `${label} (${unit})` : label}
      help={
        invalid
          ? `Enter a number${min !== undefined ? ` ≥ ${min}` : ''}${max !== undefined ? ` ≤ ${max}` : ''}`
          : help
      }
      id={id}
    >
      <input
        id={id}
        type='number'
        value={text}
        min={min}
        max={max}
        step={step}
        aria-invalid={invalid}
        onChange={e => commit(e.target.value)}
      />
    </Field>
  );
}

export function Slider({
  label,
  value,
  onChange,
  min,
  max,
  step = 0.1,
  help,
  format,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  help?: string;
  format?: (v: number) => string;
}) {
  const id = useId();
  return (
    <Field
      label={`${label}: ${format ? format(value) : value}`}
      help={help}
      id={id}
    >
      <input
        id={id}
        type='range'
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        aria-valuetext={format ? format(value) : String(value)}
      />
    </Field>
  );
}

export function RangeField({
  label,
  value,
  onChange,
  min = 0,
  max = 10,
  step = 0.5,
}: {
  label: string;
  value: { min: number; max: number };
  onChange: (v: { min: number; max: number }) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <fieldset className='row' style={{ border: 'none', padding: 0, margin: 0 }}>
      <legend className='muted'>{label}</legend>
      <NumberField
        label='Min'
        value={value.min}
        min={min}
        max={value.max}
        step={step}
        onChange={v => onChange({ ...value, min: v })}
      />
      <NumberField
        label='Max'
        value={value.max}
        min={value.min}
        max={max}
        step={step}
        onChange={v => onChange({ ...value, max: v })}
      />
    </fieldset>
  );
}

export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  help,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[] | readonly T[];
  onChange: (v: T) => void;
  help?: string;
}) {
  const id = useId();
  const opts = options.map(o =>
    typeof o === 'string' ? { value: o as T, label: o as string } : o
  ) as { value: T; label: string }[];
  return (
    <Field label={label} help={help} id={id}>
      <select
        id={id}
        value={value}
        onChange={e => onChange(e.target.value as T)}
      >
        {opts.map(o => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function MultiSelect({
  label,
  value,
  options,
  onChange,
  help,
}: {
  label: string;
  value: readonly string[];
  options: readonly { value: string; label: string }[];
  onChange: (v: string[]) => void;
  help?: string;
}) {
  return (
    <fieldset
      className='field'
      style={{
        border: '1px solid var(--f-border)',
        borderRadius: 4,
        padding: 8,
      }}
    >
      <legend className='label'>{label}</legend>
      <div className='row'>
        {options.map(o => (
          <label key={o.value} className='toggle'>
            <input
              type='checkbox'
              checked={value.includes(o.value)}
              onChange={e =>
                onChange(
                  e.target.checked
                    ? [...value, o.value]
                    : value.filter(x => x !== o.value)
                )
              }
            />
            {o.label}
          </label>
        ))}
      </div>
      {help && <span className='help'>{help}</span>}
    </fieldset>
  );
}

/** Comma/newline-separated list of words. */
export function TagInput({
  label,
  value,
  onChange,
  help,
}: {
  label: string;
  value: readonly string[];
  onChange: (v: string[]) => void;
  help?: string;
}) {
  const id = useId();
  const [text, setText] = useState(value.join(', '));
  useEffect(() => setText(value.join(', ')), [value]);
  return (
    <Field label={label} help={help ?? 'Separate with commas'} id={id}>
      <input
        id={id}
        type='text'
        value={text}
        onChange={e => setText(e.target.value)}
        onBlur={() =>
          onChange(
            text
              .split(/[,\n]/)
              .map(s => s.trim())
              .filter(Boolean)
          )
        }
      />
    </Field>
  );
}

export type WeightedRow = {
  id: string;
  label: string;
  weight: number;
  enabled: boolean;
};

/** Weighted-choice editor with live probability display. */
export function WeightedChoiceEditor({
  rows,
  onChange,
  max = 100,
  title,
}: {
  rows: WeightedRow[];
  onChange: (id: string, patch: Partial<WeightedRow>) => void;
  max?: number;
  title?: string;
}) {
  const total = rows.filter(r => r.enabled).reduce((s, r) => s + r.weight, 0);
  return (
    <table>
      {title && (
        <caption className='muted' style={{ textAlign: 'left' }}>
          {title}
        </caption>
      )}
      <thead>
        <tr>
          <th scope='col'>On</th>
          <th scope='col'>Option</th>
          <th scope='col'>Weight</th>
          <th scope='col'>Share</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.id}>
            <td>
              <input
                type='checkbox'
                aria-label={`Enable ${r.label}`}
                checked={r.enabled}
                onChange={e => onChange(r.id, { enabled: e.target.checked })}
              />
            </td>
            <td>{r.label}</td>
            <td style={{ width: 160 }}>
              <input
                type='range'
                aria-label={`Weight of ${r.label}`}
                min={0}
                max={max}
                step={max > 10 ? 1 : 0.1}
                value={r.weight}
                onChange={e =>
                  onChange(r.id, { weight: Number(e.target.value) })
                }
              />
              <span className='muted'> {r.weight}</span>
            </td>
            <td>
              {r.enabled && total > 0
                ? `${Math.round((r.weight / total) * 100)}%`
                : '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Raw JSON editor that validates before committing. */
export function JsonEditor<T>({
  label,
  value,
  validator,
  onCommit,
  extraCheck,
  rows = 14,
}: {
  label: string;
  value: T;
  validator?: Validator<T>;
  onCommit: (v: T) => void;
  extraCheck?: (v: T) => string[];
  rows?: number;
}) {
  const id = useId();
  const initial = useMemo(() => JSON.stringify(value, null, 2), [value]);
  const [text, setText] = useState(initial);
  const [errors, setErrors] = useState<string[]>([]);
  useEffect(() => {
    setText(initial);
    setErrors([]);
  }, [initial]);
  const check = (raw: string): { ok: boolean; value?: T; errors: string[] } => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return { ok: false, errors: [`JSON syntax: ${(e as Error).message}`] };
    }
    if (validator) {
      const r = validate(validator, parsed);
      if (!r.ok)
        return { ok: false, errors: formatIssues(r.issues).split('\n') };
      parsed = r.value;
    }
    const findings = scanValue(parsed);
    if (findings.length)
      return {
        ok: false,
        errors: [
          `Excluded vocabulary: ${describeFindings(findings.slice(0, 5))}`,
        ],
      };
    const extra = extraCheck?.(parsed as T) ?? [];
    return { ok: extra.length === 0, value: parsed as T, errors: extra };
  };
  const dirty = text !== initial;
  return (
    <div className='field'>
      <label htmlFor={id}>{label}</label>
      <textarea
        id={id}
        rows={rows}
        spellCheck={false}
        value={text}
        aria-invalid={errors.length > 0}
        aria-describedby={`${id}-err`}
        onChange={e => {
          setText(e.target.value);
          setErrors(check(e.target.value).errors);
        }}
      />
      <div id={`${id}-err`} role='status' aria-live='polite'>
        {errors.length > 0 && (
          <ul className='diag error'>
            {errors.slice(0, 12).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        )}
      </div>
      <div className='row'>
        <button
          type='button'
          className='primary small'
          disabled={!dirty || errors.length > 0}
          onClick={() => {
            const r = check(text);
            if (r.ok) onCommit(r.value as T);
            else setErrors(r.errors);
          }}
        >
          Apply JSON
        </button>
        <button
          type='button'
          className='small'
          disabled={!dirty}
          onClick={() => setText(initial)}
        >
          Revert
        </button>
      </div>
    </div>
  );
}

export function Card({
  title,
  children,
  actions,
  changed,
  level = 2,
}: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  changed?: boolean;
  level?: 2 | 3;
}) {
  const H = level === 2 ? 'h2' : 'h3';
  return (
    <section className='card' aria-label={title}>
      <header>
        {changed && (
          <span
            className='dot'
            title='Unsaved changes'
            aria-label='Unsaved changes'
          />
        )}
        <H>{title}</H>
        {actions}
      </header>
      {children}
    </section>
  );
}

export function Diagnostics({
  errors,
  warnings,
}: {
  errors: { message: string; eventId?: string; path?: string }[];
  warnings?: { message: string; eventId?: string; path?: string }[];
}) {
  if (!errors.length && !warnings?.length)
    return <p className='ok'>No problems found.</p>;
  const line = (d: { message: string; eventId?: string; path?: string }) =>
    `${d.eventId ? `[${d.eventId}] ` : ''}${d.path ? `${d.path}: ` : ''}${d.message}`;
  return (
    <div role='status'>
      {errors.length > 0 && (
        <ul className='diag error'>
          {errors.map((d, i) => (
            <li key={i}>{line(d)}</li>
          ))}
        </ul>
      )}
      {warnings && warnings.length > 0 && (
        <ul className='diag warn'>
          {warnings.map((d, i) => (
            <li key={i}>{line(d)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Generic list editor for configurable items (identities, dictionaries,
 * styles, checks…): pick an item, edit structured fields, or edit raw JSON.
 */
export function ItemListEditor<T extends { id: string }>({
  items,
  label,
  origin,
  validator,
  onSave,
  onRemove,
  onCreate,
  renderFields,
  describe,
}: {
  items: T[];
  label: (item: T) => string;
  origin?: (id: string) => 'builtin' | 'override' | 'custom';
  validator: Validator<T>;
  onSave: (item: T) => void;
  onRemove?: (id: string) => void;
  onCreate?: () => T;
  renderFields?: (item: T, set: (next: T) => void) => ReactNode;
  describe?: (item: T) => string;
}) {
  const [selected, setSelected] = useState<string | undefined>(items[0]?.id);
  const [mode, setMode] = useState<'form' | 'json'>(
    renderFields ? 'form' : 'json'
  );
  const item = items.find(i => i.id === selected) ?? items[0];
  const o = item && origin ? origin(item.id) : 'custom';
  return (
    <div className='split'>
      <div className='stack'>
        <div className='list' role='listbox' aria-label='Items'>
          {items.map(i => (
            <button
              key={i.id}
              type='button'
              role='option'
              aria-selected={i.id === item?.id}
              aria-current={i.id === item?.id}
              onClick={() => setSelected(i.id)}
            >
              <span>{label(i)}</span>
              {origin && (
                <span className={`badge ${origin(i.id)}`}>{origin(i.id)}</span>
              )}
            </button>
          ))}
        </div>
        {onCreate && (
          <button
            type='button'
            onClick={() => {
              const fresh = onCreate();
              onSave(fresh);
              setSelected(fresh.id);
            }}
          >
            + New
          </button>
        )}
      </div>
      {item ? (
        <div className='stack'>
          {describe && <p className='muted'>{describe(item)}</p>}
          <div className='row'>
            {renderFields && (
              <div className='tabs' role='tablist'>
                <button
                  type='button'
                  role='tab'
                  aria-selected={mode === 'form'}
                  onClick={() => setMode('form')}
                >
                  Fields
                </button>
                <button
                  type='button'
                  role='tab'
                  aria-selected={mode === 'json'}
                  onClick={() => setMode('json')}
                >
                  JSON
                </button>
              </div>
            )}
            <span className='spacer' style={{ flex: 1 }} />
            {onCreate && (
              <button
                type='button'
                className='small'
                onClick={() => {
                  const copy = {
                    ...structuredClone(item),
                    id: `${item.id}_copy_${Date.now().toString(36)}`,
                    builtin: undefined,
                  } as T;
                  onSave(copy);
                  setSelected(copy.id);
                }}
              >
                Duplicate
              </button>
            )}
            {onRemove && o !== 'builtin' && (
              <button
                type='button'
                className='small danger'
                onClick={() => onRemove(item.id)}
              >
                {o === 'override' ? 'Revert to built-in' : 'Delete'}
              </button>
            )}
          </div>
          {mode === 'form' && renderFields ? (
            renderFields(item, next => onSave({ ...next, builtin: undefined }))
          ) : (
            <JsonEditor
              label='Raw JSON (validated before applying)'
              value={item}
              validator={validator}
              onCommit={v => onSave({ ...v, builtin: undefined })}
              rows={20}
            />
          )}
        </div>
      ) : (
        <p className='muted'>Nothing here yet.</p>
      )}
    </div>
  );
}

/** Minimal SVG step chart (no dependencies). */
export function StepChart({
  series,
  height = 140,
  maxY,
  markers = [],
  label,
}: {
  series: { name: string; color: string; points: { t: number; v: number }[] }[];
  height?: number;
  maxY?: number;
  markers?: { t: number; label: string }[];
  label: string;
}) {
  const width = 800;
  const end = Math.max(
    1,
    ...series.flatMap(s => s.points.map(p => p.t)),
    ...markers.map(m => m.t)
  );
  const top =
    maxY ?? Math.max(1, ...series.flatMap(s => s.points.map(p => p.v)));
  const x = (t: number) => (t / end) * (width - 20) + 10;
  const y = (v: number) => height - 10 - (v / top) * (height - 20);
  const path = (pts: { t: number; v: number }[]) => {
    if (!pts.length) return '';
    let d = `M${x(pts[0].t)},${y(pts[0].v)}`;
    for (let i = 1; i < pts.length; i++)
      d += ` H${x(pts[i].t)} V${y(pts[i].v)}`;
    return d + ` H${x(end)}`;
  };
  return (
    <figure style={{ margin: 0 }}>
      <svg
        className='chart'
        viewBox={`0 0 ${width} ${height}`}
        role='img'
        aria-label={label}
      >
        {markers.map((m, i) => (
          <g key={i}>
            <line x1={x(m.t)} x2={x(m.t)} y1={0} y2={height} stroke='#fff3' />
            <title>{m.label}</title>
          </g>
        ))}
        {series.map(s => (
          <path
            key={s.name}
            d={path(s.points)}
            fill='none'
            style={{ stroke: s.color }}
            strokeWidth={2}
          />
        ))}
      </svg>
      <figcaption className='row muted'>
        {series.map(s => (
          <span key={s.name}>
            <span style={{ color: s.color }}>■</span> {s.name}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

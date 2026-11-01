/**
 * Category editors. Each registered category names an editor key; unknown
 * keys fall back to the validated JSON editor so newly registered
 * categories are editable without new UI code.
 */
import { ReactNode, useMemo, useState } from 'react';
import { CategoryDef, getPath, setPath } from '../config/registry';
import { CompiledConfig, originOf } from '../config/library';
import { ForgeConfig, forgeConfigV } from '../config/schema';
import { validate, Validator } from '../core/validate';
import { Rng } from '../core/rng';
import { scanText } from '../content/guard';
import { BUILTIN_IDENTITY_CATEGORIES, GRAMMATICAL_PERSONS, TERM_REGISTERS, anatomyProfileV, dictionaryV, identityProfileV, pronounSetV, AnatomyProfile, Dictionary, IdentityProfile, TermRegister } from '../identity/types';
import { lintIdentity, previewIdentity } from '../identity/render';
import { narrativeStyleV, NarrativeStyle, HYPNO_PATTERNS } from '../narrative/types';
import { checkStyleMix } from '../narrative/compose';
import { ConditionInput, GAME_PHASES } from '../events/types';
import { formatCondition, parseCondition } from '../events/dsl';
import { complianceCheckV, ComplianceCheck, previewSchedule, RESPONSE_VALUES, CHECK_KINDS } from '../checks/checks';
import { promptTemplateV, PromptTemplate, PROMPT_TRIGGERS } from '../prompts/prompts';
import { accountingRuleV, AccountingRule } from '../accounting/accounting';
import { SESSION_EVENT_TYPES } from '../session/types';
import { formatMs } from '../session/analysis';
import { Card, ItemListEditor, JsonEditor, MultiSelect, NumberField, RangeField, Select, Slider, TagInput, TextField, Toggle } from './components';
import { EventEditor } from './EventEditor';

export type EditorProps = {
  config: ForgeConfig;
  compiled: CompiledConfig;
  update: (fn: (c: ForgeConfig) => ForgeConfig) => void;
  def: CategoryDef;
};

const uid = (prefix: string) => `${prefix}_${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;

/** Upsert an item into a config list by id. */
function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  const i = list.findIndex(x => x.id === item.id);
  return i < 0 ? [...list, item] : list.map(x => (x.id === item.id ? item : x));
}

export function ConditionField({ label, value, onChange, help }: { label: string; value: ConditionInput | undefined; onChange: (v: ConditionInput | undefined) => void; help?: string }) {
  const initial = value === undefined ? '' : typeof value === 'string' ? value : formatCondition(value);
  const [text, setText] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className='field'>
      <label>
        {label}
        <input type='text' value={text} placeholder='e.g. session.intensity >= 4 and history.last != "pause"' onChange={e => {
          setText(e.target.value);
          if (!e.target.value.trim()) {
            setError(null);
            onChange(undefined);
            return;
          }
          try {
            parseCondition(e.target.value);
            setError(null);
            onChange(e.target.value);
          } catch (err) {
            setError((err as Error).message);
          }
        }} />
      </label>
      <span className={error ? 'help error' : 'help'} role='status'>{error ?? help ?? 'Restricted condition language — see Events › Reference.'}</span>
    </div>
  );
}

// ---------------------------------------------------------------- identity

function IdentityPicker({ config, compiled, update }: EditorProps) {
  const ids = Object.values(compiled.library.identities);
  return (
    <div className='grid'>
      {ids.map(i => (
        <label key={i.id} className='card toggle' style={{ alignItems: 'flex-start' }}>
          <input type='radio' name='identity' checked={config.session.identityId === i.id} onChange={() => update(c => setPath(c, 'session.identityId', i.id))} />
          <span>
            <strong>{i.displayName}</strong>
            <br />
            <span className='muted'>{i.description}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

function IdentityPreview({ identity, compiled, config }: { identity: IdentityProfile; compiled: CompiledConfig; config: ForgeConfig }) {
  const [seed, setSeed] = useState(1);
  const anatomy = compiled.library.anatomy[config.session.anatomyId] ?? Object.values(compiled.library.anatomy)[0];
  const pronouns = config.session.pronounsOverride ? compiled.library.pronouns[config.session.pronounsOverride] : undefined;
  const lines = previewIdentity({ identity, anatomy, pronouns, dictionaries: compiled.library.dictionaries, rng: Rng.fromSeed(`preview${seed}`), intensity: 5, vars: { pace: 2, intensity: 5, grip: 'both hands', count: 3 } });
  const lint = lintIdentity(identity, anatomy, compiled.library.dictionaries);
  return (
    <Card title='Preview' level={3} actions={<button type='button' className='small' onClick={() => setSeed(s => s + 1)}>Reroll</button>}>
      <p className='muted'>Rendered with anatomy “{anatomy.name}”{pronouns ? ` and pronouns ${pronouns.label}` : ''} (change under Gender & body-part naming).</p>
      <div className='preview' aria-live='polite'>
        {lines.map((l, i) => (
          <p key={i} title={l.template}>
            {l.text}
            {l.missing.length > 0 && <span className='warn'> (unresolved: {l.missing.join(' ')})</span>}
            {l.blocked.length > 0 && <span className='error'> (blocked: {l.blocked.join(', ')})</span>}
          </p>
        ))}
      </div>
      {lint.length > 0 && (
        <ul className='diag warn'>
          {lint.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function IdentityEditor({ config, compiled, update }: EditorProps) {
  const items = Object.values(compiled.library.identities);
  const lib = compiled.library;
  return (
    <ItemListEditor<IdentityProfile>
      items={items}
      label={i => i.displayName}
      origin={id => originOf('identities', id, config)}
      validator={identityProfileV as Validator<IdentityProfile>}
      onSave={item => update(c => ({ ...c, identities: upsert(c.identities, item) }))}
      onRemove={id => update(c => ({ ...c, identities: c.identities.filter(x => x.id !== id) }))}
      onCreate={() => ({ ...structuredClone(lib.identities.doll), id: uid('identity'), displayName: 'New identity', category: 'custom', builtin: undefined })}
      describe={i => i.description}
      renderFields={(i, set) => (
        <div className='stack'>
          <div className='grid'>
            <TextField label='Display name' value={i.displayName} onChange={x => set({ ...i, displayName: x })} />
            <div className='field'>
              <label>
                Category
                <input type='text' list='identity-categories' value={i.category} onChange={e => set({ ...i, category: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })} />
              </label>
              <datalist id='identity-categories'>
                {BUILTIN_IDENTITY_CATEGORIES.map(c => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <span className='help'>Pick a built-in category or type a new one.</span>
            </div>
            <TextField label='Object noun' value={i.objectNoun.singular} onChange={x => set({ ...i, objectNoun: { ...i.objectNoun, singular: x } })} help='Used by {object}' />
            <TextField label='Plural' value={i.objectNoun.plural ?? ''} onChange={x => set({ ...i, objectNoun: { ...i.objectNoun, plural: x || undefined } })} help='Blank = automatic' />
            <Select label='Pronouns' value={i.pronouns.id} options={Object.values(lib.pronouns).map(p => ({ value: p.id, label: p.label }))} onChange={x => set({ ...i, pronouns: lib.pronouns[x] })} />
            <Select label='Grammatical person' value={i.person} options={GRAMMATICAL_PERSONS.map(p => ({ value: p, label: `${p} person` }))} onChange={x => set({ ...i, person: x })} />
            <Select label='Presentation' value={i.presentation.mode} options={['gendered', 'neutral', 'custom'] as const} onChange={x => set({ ...i, presentation: { ...i.presentation, mode: x } })} />
            <TextField label='Reference noun' value={i.presentation.noun} onChange={x => set({ ...i, presentation: { ...i.presentation, noun: x } })} help='Used by {noun}, e.g. “girl”, “boy”, “one”. Blank = object noun.' />
            <TextField label='Narrator' value={i.perspective.narrator} onChange={x => set({ ...i, perspective: { ...i.perspective, narrator: x } })} />
            <Select label='Voice' value={i.perspective.voice} options={['direct', 'observational', 'ceremonial', 'mechanical'] as const} onChange={x => set({ ...i, perspective: { ...i.perspective, voice: x } })} />
          </div>
          <TextField label='Description' value={i.description} onChange={x => set({ ...i, description: x })} multiline />
          <MultiSelect label='Dictionaries (in priority order of selection)' value={i.dictionaries} options={Object.values(lib.dictionaries).map(d => ({ value: d.id, label: d.name }))} onChange={x => set({ ...i, dictionaries: x })} />
          <MultiSelect label='Applicable narrative styles (none = all)' value={i.styles} options={Object.values(lib.styles).map(s => ({ value: s.id, label: s.name }))} onChange={x => set({ ...i, styles: x })} />
          <div className='grid'>
            <TagInput label='Preferred words' value={i.preferredWords} onChange={x => set({ ...i, preferredWords: x })} help='Entries containing these are weighted ×2' />
            <TagInput label='Prohibited words' value={i.prohibitedWords} onChange={x => set({ ...i, prohibitedWords: x })} help='Never rendered for this identity' />
            <TagInput label='Event tags (none = all)' value={i.eventTags} onChange={x => set({ ...i, eventTags: x })} />
          </div>
          <RangeField label='Intensity limits for this identity' value={i.intensity} onChange={x => set({ ...i, intensity: x })} />
          <Card title='Custom rules (literal whole-word replacements)' level={3} actions={<button type='button' className='small' onClick={() => set({ ...i, rules: [...i.rules, { id: uid('rule'), enabled: true, find: 'word', replace: 'replacement' }] })}>+ Rule</button>}>
            <table>
              <thead><tr><th>On</th><th>Find</th><th>Replace</th><th /></tr></thead>
              <tbody>
                {i.rules.map((r, n) => (
                  <tr key={r.id}>
                    <td><input type='checkbox' aria-label='Enabled' checked={r.enabled} onChange={e => set({ ...i, rules: i.rules.map((x, k) => (k === n ? { ...x, enabled: e.target.checked } : x)) })} /></td>
                    <td><input type='text' aria-label='Find' value={r.find} onChange={e => set({ ...i, rules: i.rules.map((x, k) => (k === n ? { ...x, find: e.target.value } : x)) })} /></td>
                    <td><input type='text' aria-label='Replace' value={r.replace} onChange={e => set({ ...i, rules: i.rules.map((x, k) => (k === n ? { ...x, replace: e.target.value } : x)) })} /></td>
                    <td><button type='button' className='small' onClick={() => set({ ...i, rules: i.rules.filter((_, k) => k !== n) })}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <IdentityPreview identity={i} compiled={compiled} config={config} />
        </div>
      )}
    />
  );
}

function DictionaryEditor({ config, compiled, update }: EditorProps) {
  const items = Object.values(compiled.library.dictionaries);
  const [filter, setFilter] = useState('');
  return (
    <ItemListEditor<Dictionary>
      items={items}
      label={d => `${d.name} (${d.entries.length})`}
      origin={id => originOf('dictionaries', id, config)}
      validator={dictionaryV as Validator<Dictionary>}
      onSave={d => update(c => ({ ...c, dictionaries: upsert(c.dictionaries, d) }))}
      onRemove={id => update(c => ({ ...c, dictionaries: c.dictionaries.filter(x => x.id !== id) }))}
      onCreate={() => ({ id: uid('dict'), name: 'New dictionary', description: '', categories: ['object_reference'], extends: [], entries: [], styleOverrides: {} })}
      describe={d => d.description}
      renderFields={(d, set) => {
        const cats = [...new Set([...d.categories, ...d.entries.map(e => e.category)])];
        const shown = d.entries.filter(e => !filter || e.text.toLowerCase().includes(filter.toLowerCase()) || e.category.includes(filter.toLowerCase()));
        const patch = (id: string, p: Partial<Dictionary['entries'][number]>) => set({ ...d, entries: d.entries.map(e => (e.id === id ? { ...e, ...p } : e)) });
        return (
          <div className='stack'>
            <div className='grid'>
              <TextField label='Name' value={d.name} onChange={x => set({ ...d, name: x })} />
              <TagInput label='Semantic categories' value={d.categories} onChange={x => set({ ...d, categories: x })} />
            </div>
            <MultiSelect label='Inherits from (explicit only)' value={d.extends} options={items.filter(x => x.id !== d.id).map(x => ({ value: x.id, label: x.name }))} onChange={x => set({ ...d, extends: x })} />
            <div className='row'>
              <input type='search' aria-label='Filter entries' placeholder='Filter entries…' value={filter} onChange={e => setFilter(e.target.value)} style={{ maxWidth: 260 }} />
              <button type='button' className='small' onClick={() => set({ ...d, entries: [...d.entries, { id: uid('e'), text: 'new term', category: cats[0] ?? 'general', weight: 1, enabled: true, styles: [] }] })}>+ Entry</button>
            </div>
            <table>
              <thead><tr><th>On</th><th>Text</th><th>Category</th><th>Weight</th><th /></tr></thead>
              <tbody>
                {shown.map(e => {
                  const flagged = scanText(e.text);
                  return (
                    <tr key={e.id}>
                      <td><input type='checkbox' aria-label={`Enable ${e.text}`} checked={e.enabled} onChange={x => patch(e.id, { enabled: x.target.checked })} /></td>
                      <td>
                        <input type='text' aria-label='Entry text' aria-invalid={flagged.length > 0} value={e.text} onChange={x => patch(e.id, { text: x.target.value })} />
                        {flagged.length > 0 && <span className='error help'>Excluded term “{flagged[0].match}” — cannot be saved.</span>}
                      </td>
                      <td>
                        <select aria-label='Category' value={e.category} onChange={x => patch(e.id, { category: x.target.value })}>
                          {cats.map(c => (<option key={c} value={c}>{c}</option>))}
                        </select>
                      </td>
                      <td style={{ width: 80 }}><input type='number' aria-label='Weight' min={0} max={100} value={e.weight} onChange={x => Number.isFinite(Number(x.target.value)) && patch(e.id, { weight: Math.max(0, Number(x.target.value)) })} /></td>
                      <td><button type='button' className='small' onClick={() => set({ ...d, entries: d.entries.filter(x => x.id !== e.id) })}>Remove</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className='muted'>Per-entry intensity windows and style restrictions, and per-style overrides, are editable in the JSON tab.</p>
          </div>
        );
      }}
    />
  );
}

function PronounEditor({ config, compiled, update }: EditorProps) {
  const lib = compiled.library;
  return (
    <div className='stack'>
      <div className='grid'>
        <Select label='Pronoun override for this session' value={config.session.pronounsOverride ?? ''} options={[{ value: '', label: 'Identity default' }, ...Object.values(lib.pronouns).map(p => ({ value: p.id, label: p.label }))]} onChange={x => update(c => setPath(c, 'session.pronounsOverride', x || null))} />
        <Select label='Grammatical person override' value={config.session.personOverride ?? ''} options={[{ value: '', label: 'Identity default' }, ...GRAMMATICAL_PERSONS.map(p => ({ value: p, label: `${p} person` }))]} onChange={x => update(c => setPath(c, 'session.personOverride', x || null))} />
      </div>
      <p className='muted'>Pronouns, presentation and anatomy are independent: no setting infers one from another.</p>
      <ItemListEditor
        items={Object.values(lib.pronouns)}
        label={p => p.label}
        origin={id => originOf('pronouns', id, config)}
        validator={pronounSetV}
        onSave={p => update(c => ({ ...c, pronouns: upsert(c.pronouns, p) }))}
        onRemove={id => update(c => ({ ...c, pronouns: c.pronouns.filter(x => x.id !== id) }))}
        onCreate={() => ({ id: uid('pron'), label: 'custom', subject: 'ze', object: 'zir', possessiveDeterminer: 'zir', possessivePronoun: 'zirs', reflexive: 'zirself', pluralVerbs: false })}
        renderFields={(p, set) => (
          <div className='grid'>
            {(['label', 'subject', 'object', 'possessiveDeterminer', 'possessivePronoun', 'reflexive'] as const).map(k => (
              <TextField key={k} label={k} value={p[k]} onChange={x => set({ ...p, [k]: x })} />
            ))}
            <Toggle label='Plural verb agreement (“they are”)' checked={p.pluralVerbs} onChange={x => set({ ...p, pluralVerbs: x })} />
          </div>
        )}
      />
    </div>
  );
}

function AnatomyEditor({ config, compiled, update }: EditorProps) {
  const lib = compiled.library;
  return (
    <div className='stack'>
      <Select label='Anatomy profile for this session' value={config.session.anatomyId} options={Object.values(lib.anatomy).map(a => ({ value: a.id, label: a.name }))} onChange={x => update(c => setPath(c, 'session.anatomyId', x))} help='Independent of identity and gender presentation.' />
      <ItemListEditor<AnatomyProfile>
        items={Object.values(lib.anatomy)}
        label={a => a.name}
        origin={id => originOf('anatomy', id, config)}
        validator={anatomyProfileV as Validator<AnatomyProfile>}
        onSave={a => update(c => ({ ...c, anatomy: upsert(c.anatomy, a) }))}
        onRemove={id => update(c => ({ ...c, anatomy: c.anatomy.filter(x => x.id !== id) }))}
        onCreate={() => ({ ...structuredClone(lib['anatomy']['anatomy.unspecified']), id: uid('anatomy'), name: 'Custom anatomy', builtin: undefined })}
        renderFields={(a, set) => (
          <div className='stack'>
            <div className='grid'>
              <TextField label='Name' value={a.name} onChange={x => set({ ...a, name: x })} />
              <TextField label='Action verb' value={a.actionVerb} onChange={x => set({ ...a, actionVerb: x })} help='Used by {action} / {actioning}' />
            </div>
            {a.parts.map((part, pi) => {
              const setPart = (p: typeof part) => set({ ...a, parts: a.parts.map((x, k) => (k === pi ? p : x)) });
              return (
                <Card key={part.partId} level={3} title={`${part.label} — {part:${part.partId}}`} actions={<Toggle label='Enabled' checked={part.enabled} onChange={x => setPart({ ...part, enabled: x })} />}>
                  <Select label='Default register' value={part.defaultRegister} options={TERM_REGISTERS} onChange={x => setPart({ ...part, defaultRegister: x as TermRegister })} />
                  <table>
                    <thead><tr><th>On</th><th>Singular</th><th>Plural</th><th>Possessive</th><th>Register</th><th>Weight</th><th /></tr></thead>
                    <tbody>
                      {part.terms.map((t, ti) => {
                        const setTerm = (n: typeof t) => setPart({ ...part, terms: part.terms.map((x, k) => (k === ti ? n : x)) });
                        return (
                          <tr key={t.id}>
                            <td><input type='checkbox' aria-label='Enabled' checked={t.enabled} onChange={e => setTerm({ ...t, enabled: e.target.checked })} /></td>
                            <td><input type='text' aria-label='Singular' value={t.forms.singular} onChange={e => setTerm({ ...t, forms: { ...t.forms, singular: e.target.value } })} /></td>
                            <td><input type='text' aria-label='Plural' placeholder='auto' value={t.forms.plural ?? ''} onChange={e => setTerm({ ...t, forms: { ...t.forms, plural: e.target.value || undefined } })} /></td>
                            <td><input type='text' aria-label='Possessive' placeholder='auto' value={t.forms.possessive ?? ''} onChange={e => setTerm({ ...t, forms: { ...t.forms, possessive: e.target.value || undefined } })} /></td>
                            <td><select aria-label='Register' value={t.register} onChange={e => setTerm({ ...t, register: e.target.value as TermRegister })}>{TERM_REGISTERS.map(r => <option key={r}>{r}</option>)}</select></td>
                            <td style={{ width: 70 }}><input type='number' aria-label='Weight' min={0} value={t.weight} onChange={e => setTerm({ ...t, weight: Math.max(0, Number(e.target.value) || 0) })} /></td>
                            <td><button type='button' className='small' onClick={() => setPart({ ...part, terms: part.terms.filter((_, k) => k !== ti) })}>Remove</button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <button type='button' className='small' onClick={() => setPart({ ...part, terms: [...part.terms, { id: uid('t'), forms: { singular: 'term' }, register: 'custom', weight: 1, enabled: true, styles: [] }] })}>+ Term</button>
                </Card>
              );
            })}
          </div>
        )}
      />
    </div>
  );
}

// ---------------------------------------------------------------- narrative

function StyleMixEditor({ config, compiled, update }: EditorProps) {
  const styles = Object.values(compiled.library.styles);
  const strength = (id: string) => config.session.styleMix.find(m => m.styleId === id)?.strength ?? 0;
  const conflicts = checkStyleMix(config.session.styleMix, compiled.library.styles);
  const setStrength = (id: string, s: number) =>
    update(c => setPath(c, 'session.styleMix', [...c.session.styleMix.filter(m => m.styleId !== id), ...(s > 0 ? [{ styleId: id, strength: s }] : [])]));
  return (
    <div className='stack'>
      <p className='muted'>Tone is independent of identity: the same identity can be narrated gently, clinically or severely.</p>
      {conflicts.length > 0 && <ul className='diag warn'>{conflicts.map((c, i) => <li key={i}>{c.message}</li>)}</ul>}
      <div className='grid'>
        {styles.map(s => (
          <div key={s.id} className='card'>
            <Slider label={s.name} value={strength(s.id)} min={0} max={1} step={0.05} onChange={x => setStrength(s.id, x)} format={x => (x === 0 ? 'off' : `${Math.round(x * 100)}%`)} />
            <span className='muted'>{s.enabled ? `${s.family} · intensity ${s.intensity.min}–${s.intensity.max}` : 'style disabled — enable it in its category'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StyleEditor({ config, compiled, update, def }: EditorProps) {
  const all = Object.values(compiled.library.styles);
  const items = def.itemIds ? all.filter(s => def.itemIds!.includes(s.id)) : all;
  return (
    <ItemListEditor<NarrativeStyle>
      items={items}
      label={s => `${s.enabled ? '' : '⏻ '}${s.name}`}
      origin={id => originOf('styles', id, config)}
      validator={narrativeStyleV as Validator<NarrativeStyle>}
      onSave={s => update(c => ({ ...c, styles: upsert(c.styles, s) }))}
      onRemove={id => update(c => ({ ...c, styles: c.styles.filter(x => x.id !== id) }))}
      describe={s => s.description}
      renderFields={(s, set) => (
        <div className='stack'>
          <div className='grid'>
            <Toggle label='Enabled' checked={s.enabled} onChange={x => set({ ...s, enabled: x })} />
            <Slider label='Frequency' value={s.frequency} min={0} max={1} step={0.05} onChange={x => set({ ...s, frequency: x })} format={x => `${Math.round(x * 100)}%`} help='Chance an eligible slot uses this style' />
            <NumberField label='Weight' value={s.weight} min={0} max={100} step={0.5} onChange={x => set({ ...s, weight: x })} />
          </div>
          <RangeField label='Intensity range' value={s.intensity} onChange={x => set({ ...s, intensity: x })} />
          <ConditionField label='Activation condition' value={s.activation} onChange={x => set({ ...s, activation: x === undefined ? undefined : typeof x === 'string' ? parseCondition(x) : x })} />
          <MultiSelect label='Incompatible with' value={s.incompatibleWith} options={all.filter(x => x.id !== s.id).map(x => ({ value: x.id, label: x.name }))} onChange={x => set({ ...s, incompatibleWith: x })} />
          <div className='grid'>
            <TagInput label='Custom vocabulary ({vocab})' value={s.vocabulary} onChange={x => set({ ...s, vocabulary: x })} />
            <TagInput label='Excluded phrases' value={s.excluded} onChange={x => set({ ...s, excluded: x })} />
          </div>
          <Card title='Phrase pool' level={3} actions={<button type='button' className='small' onClick={() => set({ ...s, phrases: [...s.phrases, { id: uid(s.id), text: '{Subject} {is} a {object}.', weight: 1, enabled: true, identities: [] }] })}>+ Phrase</button>}>
            <table>
              <thead><tr><th>On</th><th>Template</th><th>Weight</th><th /></tr></thead>
              <tbody>
                {s.phrases.map((p, n) => (
                  <tr key={p.id}>
                    <td><input type='checkbox' aria-label='Enabled' checked={p.enabled} onChange={e => set({ ...s, phrases: s.phrases.map((x, k) => (k === n ? { ...x, enabled: e.target.checked } : x)) })} /></td>
                    <td><input type='text' aria-label='Template' value={p.text} onChange={e => set({ ...s, phrases: s.phrases.map((x, k) => (k === n ? { ...x, text: e.target.value } : x)) })} /></td>
                    <td style={{ width: 70 }}><input type='number' aria-label='Weight' min={0} value={p.weight} onChange={e => set({ ...s, phrases: s.phrases.map((x, k) => (k === n ? { ...x, weight: Math.max(0, Number(e.target.value) || 0) } : x)) })} /></td>
                    <td><button type='button' className='small' onClick={() => set({ ...s, phrases: s.phrases.filter((_, k) => k !== n) })}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className='muted'>Tokens: {'{subject} {they} {them} {their} {is} {verb:remain} {object} {noun} {narrator} {action} {hands} {part:chest} {term:category} {pick:a|b} {pace} {intensity}'}</p>
          </Card>
        </div>
      )}
    />
  );
}

function HypnoEditor({ config, update }: EditorProps) {
  const h = config.hypno;
  const set = (next: typeof h) => update(c => ({ ...c, hypno: next }));
  return (
    <div className='stack'>
      <p className='muted'>These are creative narration structures (repetition, rhythm, counting…). They make no claim to induce trance or alter anyone’s will, and every pattern can be switched off.</p>
      <div className='grid'>
        <Toggle label='Enable hypnosis-inspired narration' checked={h.enabled} onChange={x => set({ ...h, enabled: x })} />
        <NumberField label='Interval at intensity 0' unit='s' value={h.intervalAtMin} min={1} max={120} step={0.5} onChange={x => set({ ...h, intervalAtMin: x })} />
        <NumberField label='Interval at intensity 10' unit='s' value={h.intervalAtMax} min={0.3} max={120} step={0.1} onChange={x => set({ ...h, intervalAtMax: x })} />
        <Slider label='Transition frequency' value={h.transitionFrequency} min={0} max={1} step={0.05} onChange={x => set({ ...h, transitionFrequency: x })} format={x => `${Math.round(x * 100)}%`} />
      </div>
      <table>
        <thead><tr><th>On</th><th>Pattern</th><th>Weight</th><th>Repetitions</th><th>Variation</th><th>Max length</th><th>Custom lines</th></tr></thead>
        <tbody>
          {HYPNO_PATTERNS.map(id => {
            const p = h.patterns.find(x => x.id === id);
            if (!p) return null;
            const setP = (n: typeof p) => set({ ...h, patterns: h.patterns.map(x => (x.id === id ? n : x)) });
            return (
              <tr key={id}>
                <td><input type='checkbox' aria-label={`Enable ${id}`} checked={p.enabled} onChange={e => setP({ ...p, enabled: e.target.checked })} /></td>
                <td>{id.replace(/_/g, ' ')}</td>
                <td><input type='number' aria-label='Weight' min={0} value={p.weight} onChange={e => setP({ ...p, weight: Math.max(0, Number(e.target.value) || 0) })} /></td>
                <td><input type='number' aria-label='Repetitions' min={1} max={20} value={p.repetitions} onChange={e => setP({ ...p, repetitions: Math.min(20, Math.max(1, Math.round(Number(e.target.value) || 1))) })} /></td>
                <td><input type='number' aria-label='Variation' min={0} max={1} step={0.1} value={p.variation} onChange={e => setP({ ...p, variation: Math.min(1, Math.max(0, Number(e.target.value) || 0)) })} /></td>
                <td><input type='number' aria-label='Max length' min={20} max={2000} value={p.maxLength} onChange={e => setP({ ...p, maxLength: Math.min(2000, Math.max(20, Number(e.target.value) || 20)) })} /></td>
                <td><input type='text' aria-label='Custom lines' placeholder='built-in' value={p.lines.join(' | ')} onChange={e => setP({ ...p, lines: e.target.value.split('|').map(x => x.trim()).filter(Boolean) })} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------- session / safety

function SessionEditor({ config, update }: EditorProps) {
  const s = config.session;
  const set = (k: keyof typeof s, value: unknown) => update(c => setPath(c, `session.${k}`, value));
  return (
    <div className='stack'>
      <div className='grid'>
        <NumberField label='Duration (intensity 0 → 10)' unit='s' value={s.durationSeconds} min={60} max={14400} step={30} onChange={x => set('durationSeconds', x)} help={`≈ ${formatMs(s.durationSeconds * 1000)}`} />
        <NumberField label='Warm-up' unit='s' value={s.warmupSeconds} min={0} max={3600} onChange={x => set('warmupSeconds', x)} />
        <NumberField label='Minimum pace' unit='/s' value={s.paceMin} min={0.25} max={s.paceMax} step={0.25} onChange={x => set('paceMin', x)} />
        <NumberField label='Maximum pace' unit='/s' value={s.paceMax} min={s.paceMin} max={20} step={0.25} onChange={x => set('paceMax', x)} />
        <Slider label='Starting intensity' value={s.startIntensity} min={0} max={10} step={0.5} onChange={x => set('startIntensity', x)} />
        <Slider label='Climax chance' value={s.climaxChance} min={0} max={100} step={1} onChange={x => set('climaxChance', x)} format={x => `${x}%`} />
        <Slider label='Ruin chance' value={s.ruinChance} min={0} max={100} step={1} onChange={x => set('ruinChance', x)} format={x => `${x}%`} />
        <TextField label='Fixed seed' value={s.seed ?? ''} onChange={x => set('seed', x || null)} help='Blank = random each session. A fixed seed makes sessions reproducible.' />
        <Toggle label='Narration lines' checked={s.narrationEnabled} onChange={x => set('narrationEnabled', x)} />
      </div>
    </div>
  );
}

function SafetyEditor({ config, update }: EditorProps) {
  const s = config.safety;
  const set = (k: string, value: unknown) => update(c => setPath(c, `safety.${k}`, value));
  return (
    <div className='stack'>
      <p className='muted'>Pause and Stop are always available during a session and cannot be disabled or overridden by event scripts.</p>
      <div className='grid'>
        <Slider label='Intensity ceiling' value={s.intensityCeiling} min={0} max={10} step={0.5} onChange={x => set('intensityCeiling', x)} help='Hard limit; scripts cannot exceed it' />
        <NumberField label='Session duration limit' unit='min, 0 = none' value={s.maxDurationMinutes} min={0} max={600} onChange={x => set('maxDurationMinutes', x)} />
        <Toggle label='Scheduled breaks' checked={s.breaks.enabled} onChange={x => set('breaks.enabled', x)} />
        <NumberField label='Break every' unit='min' value={s.breaks.everyMinutes} min={1} max={240} onChange={x => set('breaks.everyMinutes', x)} />
        <NumberField label='Break length' unit='s' value={s.breaks.lengthSeconds} min={10} max={1800} onChange={x => set('breaks.lengthSeconds', x)} />
        <Toggle label='Confirm before starting' checked={s.confirmBeforeStart} onChange={x => set('confirmBeforeStart', x)} />
        <Toggle label='Always show recording indicator' checked={s.showRecordingIndicator} onChange={x => set('showRecordingIndicator', x)} />
      </div>
      <TagInput label='Additional prohibited words (everywhere)' value={s.extraProhibitedWords} onChange={x => set('extraProhibitedWords', x)} help='Added to the fixed petplay/animal-role exclusions, which cannot be removed.' />
      <TagInput label='Excluded phrases (never shown)' value={s.excludedPhrases} onChange={x => set('excludedPhrases', x)} />
    </div>
  );
}

function AccessibilityEditor({ config, update }: EditorProps) {
  const a = config.accessibility;
  const set = (k: string, value: unknown) => update(c => setPath(c, `accessibility.${k}`, value));
  return (
    <div className='grid'>
      <Select label='Reduced motion' value={a.reducedMotion} options={[{ value: 'system', label: 'Follow system' }, { value: 'on', label: 'Always' }, { value: 'off', label: 'Off' }] as const} onChange={x => set('reducedMotion', x)} />
      <Slider label='Text size' value={a.fontScale} min={0.75} max={2} step={0.05} onChange={x => set('fontScale', x)} format={x => `${Math.round(x * 100)}%`} />
      <Toggle label='High contrast' checked={a.highContrast} onChange={x => set('highContrast', x)} />
      <Slider label='Reading time multiplier' value={a.readingTimeMultiplier} min={0.5} max={4} step={0.25} onChange={x => set('readingTimeMultiplier', x)} format={x => `×${x}`} />
    </div>
  );
}

function LoggingEditor({ config, update }: EditorProps) {
  const l = config.logging;
  const set = (k: string, value: unknown) => update(c => setPath(c, `logging.${k}`, value));
  return (
    <div className='stack'>
      <p className='muted'>Session logs are stored only in this browser. Nothing is uploaded. You can export or delete them under History.</p>
      <div className='grid'>
        <Toggle label='Save session logs' checked={l.enabled} onChange={x => set('enabled', x)} help='When off, the log exists only until you leave the end screen.' />
        <Toggle label='Record narration text' checked={l.recordNarrationText} onChange={x => set('recordNarrationText', x)} />
        <Toggle label='Record prompt responses' checked={l.recordPromptText} onChange={x => set('recordPromptText', x)} />
        <Toggle label='Embed configuration snapshot' checked={l.embedConfig} onChange={x => set('embedConfig', x)} help='Required for deterministic re-simulation.' />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- prompts, checks, accounting, media

function PromptEditor({ config, compiled, update }: EditorProps) {
  const eventIds = compiled.pack ? Object.keys(compiled.pack.events) : [];
  return (
    <div className='stack'>
      <Toggle label='Enable event-triggered prompts' checked={config.prompts.enabled} onChange={x => update(c => setPath(c, 'prompts.enabled', x))} />
      <p className='muted'>A blocking prompt holds event progression until answered — but Pause, Skip, Disable and Stop always remain available.</p>
      <ItemListEditor<PromptTemplate>
        items={config.prompts.templates}
        label={p => `${p.enabled ? '' : '⏻ '}${p.name}`}
        validator={promptTemplateV as Validator<PromptTemplate>}
        onSave={p => update(c => setPath(c, 'prompts.templates', upsert(c.prompts.templates, p)))}
        onRemove={id => update(c => setPath(c, 'prompts.templates', c.prompts.templates.filter(x => x.id !== id)))}
        onCreate={() => ({ ...structuredClone(config.prompts.templates[0] ?? promptTemplateV.check({ id: 'x', name: 'x', text: 'x', vocabulary: {}, retry: {} }, '', [])), id: uid('prompt'), name: 'New prompt', text: 'Describe the {object}.', triggers: [], enabled: true })}
        renderFields={(p, set) => (
          <div className='stack'>
            <div className='grid'>
              <Toggle label='Enabled' checked={p.enabled} onChange={x => set({ ...p, enabled: x })} />
              <TextField label='Name' value={p.name} onChange={x => set({ ...p, name: x })} />
            </div>
            <TextField label='Prompt text (template)' value={p.text} onChange={x => set({ ...p, text: x })} multiline />
            <Card title='Triggers' level={3} actions={<button type='button' className='small' onClick={() => set({ ...p, triggers: [...p.triggers, { on: 'pause' }] })}>+ Trigger</button>}>
              {p.triggers.length === 0 && <p className='muted'>No automatic triggers — only shown by events with a “prompt” step.</p>}
              {p.triggers.map((t, n) => (
                <div key={n} className='row'>
                  <select aria-label='Trigger' value={t.on} onChange={e => set({ ...p, triggers: p.triggers.map((x, k) => (k === n ? { on: e.target.value as typeof t.on } : x)) })}>
                    {PROMPT_TRIGGERS.map(x => <option key={x}>{x}</option>)}
                  </select>
                  {t.on === 'intensity_threshold' && <input type='number' aria-label='Threshold' min={0} max={10} value={Number(t.value ?? 5)} onChange={e => set({ ...p, triggers: p.triggers.map((x, k) => (k === n ? { ...x, value: Number(e.target.value) } : x)) })} />}
                  {t.on === 'phase_change' && <select aria-label='Phase' value={String(t.value ?? 'break')} onChange={e => set({ ...p, triggers: p.triggers.map((x, k) => (k === n ? { ...x, value: e.target.value } : x)) })}>{GAME_PHASES.map(x => <option key={x}>{x}</option>)}</select>}
                  {t.on === 'event' && <select aria-label='Event' value={String(t.value ?? '')} onChange={e => set({ ...p, triggers: p.triggers.map((x, k) => (k === n ? { ...x, value: e.target.value } : x)) })}><option value=''>—</option>{eventIds.map(x => <option key={x}>{x}</option>)}</select>}
                  <button type='button' className='small' onClick={() => set({ ...p, triggers: p.triggers.filter((_, k) => k !== n) })}>Remove</button>
                </div>
              ))}
            </Card>
            <div className='grid'>
              <Toggle label='Required (asks before skipping)' checked={p.required} onChange={x => set({ ...p, required: x })} />
              <Toggle label='Blocking (holds events)' checked={p.blocking} onChange={x => set({ ...p, blocking: x })} />
              <NumberField label='Min length' value={p.minLength} min={0} max={5000} onChange={x => set({ ...p, minLength: x })} />
              <NumberField label='Max length' value={p.maxLength} min={1} max={5000} onChange={x => set({ ...p, maxLength: x })} />
              <Select label='Vocabulary check' value={p.vocabulary.mode} options={[{ value: 'off', label: 'Off' }, { value: 'identity', label: 'Active identity dictionary' }, { value: 'custom', label: 'Custom word list' }] as const} onChange={x => set({ ...p, vocabulary: { ...p.vocabulary, mode: x } })} />
              <NumberField label='Min vocabulary matches' value={p.vocabulary.minMatches} min={0} max={50} onChange={x => set({ ...p, vocabulary: { ...p.vocabulary, minMatches: x } })} />
              <NumberField label='Max attempts' value={p.retry.maxAttempts} min={1} max={20} onChange={x => set({ ...p, retry: { ...p.retry, maxAttempts: x } })} />
              <Select label='After last attempt' value={p.retry.onExhausted} options={['accept', 'skip'] as const} onChange={x => set({ ...p, retry: { ...p.retry, onExhausted: x } })} />
              <NumberField label='Timeout (0 = none)' unit='s' value={p.timeoutSeconds} min={0} max={3600} onChange={x => set({ ...p, timeoutSeconds: x })} />
              <Select label='On timeout' value={p.onTimeout} options={['skip', 'keep_open'] as const} onChange={x => set({ ...p, onTimeout: x })} />
              <Select label='After submitting' value={p.resume} options={[{ value: 'immediate', label: 'Resume immediately' }, { value: 'acknowledge', label: 'Wait for acknowledgment' }] as const} onChange={x => set({ ...p, resume: x })} />
              <NumberField label='Cooldown' unit='s' value={p.cooldownSeconds} min={0} max={86400} onChange={x => set({ ...p, cooldownSeconds: x })} />
            </div>
            {p.vocabulary.mode === 'custom' && <TagInput label='Required words' value={p.vocabulary.words} onChange={x => set({ ...p, vocabulary: { ...p.vocabulary, words: x } })} />}
            <MultiSelect label='Allowed perspectives (none = any)' value={p.perspectives} options={GRAMMATICAL_PERSONS.map(x => ({ value: x, label: `${x} person` }))} onChange={x => set({ ...p, perspectives: x as typeof p.perspectives })} />
          </div>
        )}
      />
    </div>
  );
}

function CheckEditor({ config, compiled, update }: EditorProps) {
  const [preview, setPreview] = useState<{ at: number; checkId: string }[] | null>(null);
  const eventIds = compiled.pack ? Object.keys(compiled.pack.events) : [];
  return (
    <div className='stack'>
      <div className='grid'>
        <Toggle label='Enable compliance checks' checked={config.checks.enabled} onChange={x => update(c => setPath(c, 'checks.enabled', x))} />
        <NumberField label='Minimum gap between any checks' unit='s' value={config.checks.globalMinGapSeconds} min={0} max={3600} onChange={x => update(c => setPath(c, 'checks.globalMinGapSeconds', x))} />
      </div>
      <p className='muted'>Checks are self-reported. A “No” only updates the statistics you configure; consequences happen only if you set one explicitly.</p>
      <div className='row'>
        <button type='button' onClick={() => setPreview(previewSchedule(config.checks.items, { durationSeconds: 900, seed: String(Date.now()), globalMinGapSeconds: config.checks.globalMinGapSeconds }))}>Preview 15-minute schedule</button>
        {preview && <span className='muted'>{preview.length} checks: {preview.map(p => `${formatMs(p.at)} ${p.checkId}`).join(' · ') || 'none'}</span>}
      </div>
      <ItemListEditor<ComplianceCheck>
        items={config.checks.items}
        label={c => `${c.enabled ? '' : '⏻ '}${c.name}`}
        validator={complianceCheckV as Validator<ComplianceCheck>}
        onSave={ch => update(c => setPath(c, 'checks.items', upsert(c.checks.items, ch)))}
        onRemove={id => update(c => setPath(c, 'checks.items', c.checks.items.filter(x => x.id !== id)))}
        onCreate={() => ({ ...structuredClone(config.checks.items[0]), id: uid('check'), name: 'New check', kind: 'custom', text: 'Are you following along?', eventIds: [] })}
        renderFields={(ch, set) => (
          <div className='stack'>
            <div className='grid'>
              <Toggle label='Enabled' checked={ch.enabled} onChange={x => set({ ...ch, enabled: x })} />
              <TextField label='Name' value={ch.name} onChange={x => set({ ...ch, name: x })} />
              <Select label='Kind' value={ch.kind} options={CHECK_KINDS} onChange={x => set({ ...ch, kind: x })} />
            </div>
            <TextField label='Question (template)' value={ch.text} onChange={x => set({ ...ch, text: x })} />
            <Card title='Responses' level={3} actions={<button type='button' className='small' disabled={ch.responses.length >= 8} onClick={() => set({ ...ch, responses: [...ch.responses, { id: uid('r'), label: 'Option', value: 'neutral' }] })}>+ Response</button>}>
              <table>
                <thead><tr><th>Id</th><th>Label</th><th>Counts as</th><th>Statistic (optional)</th><th /></tr></thead>
                <tbody>
                  {ch.responses.map((r, n) => {
                    const setR = (x: typeof r) => set({ ...ch, responses: ch.responses.map((y, k) => (k === n ? x : y)) });
                    return (
                      <tr key={n}>
                        <td><input type='text' aria-label='Response id' value={r.id} onChange={e => setR({ ...r, id: e.target.value.replace(/[^a-z0-9_]/gi, '_') })} /></td>
                        <td><input type='text' aria-label='Label' value={r.label} onChange={e => setR({ ...r, label: e.target.value })} /></td>
                        <td><select aria-label='Counts as' value={r.value} onChange={e => setR({ ...r, value: e.target.value as typeof r.value })}>{RESPONSE_VALUES.map(x => <option key={x}>{x}</option>)}</select></td>
                        <td className='row'>
                          <input type='text' aria-label='Statistic name' placeholder='none' value={r.stat?.name ?? ''} onChange={e => setR({ ...r, stat: e.target.value ? { name: e.target.value.replace(/[^a-z0-9_]/gi, '_'), add: r.stat?.add ?? 1 } : undefined })} style={{ width: 120 }} />
                          {r.stat && <input type='number' aria-label='Add' value={r.stat.add} onChange={e => setR({ ...r, stat: { ...r.stat!, add: Number(e.target.value) || 0 } })} style={{ width: 60 }} />}
                        </td>
                        <td><button type='button' className='small' disabled={ch.responses.length <= 1} onClick={() => set({ ...ch, responses: ch.responses.filter((_, k) => k !== n) })}>Remove</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
            <div className='grid'>
              <Select label='Schedule' value={ch.schedule.mode} options={[{ value: 'random', label: 'Random (rate)' }, { value: 'interval', label: 'Interval + jitter' }, { value: 'event_only', label: 'Only from events' }] as const} onChange={x => set({ ...ch, schedule: { ...ch.schedule, mode: x } })} />
              {ch.schedule.mode === 'random' && <NumberField label='Expected per minute' value={ch.schedule.perMinute} min={0} max={10} step={0.05} onChange={x => set({ ...ch, schedule: { ...ch.schedule, perMinute: x } })} />}
              {ch.schedule.mode === 'interval' && <NumberField label='Interval' unit='s' value={ch.schedule.intervalSeconds} min={5} max={7200} onChange={x => set({ ...ch, schedule: { ...ch.schedule, intervalSeconds: x } })} />}
              {ch.schedule.mode === 'interval' && <NumberField label='Jitter' unit='s' value={ch.schedule.jitterSeconds} min={0} max={3600} onChange={x => set({ ...ch, schedule: { ...ch.schedule, jitterSeconds: x } })} />}
              <NumberField label='Min gap' unit='s' value={ch.schedule.minGapSeconds} min={0} max={7200} onChange={x => set({ ...ch, schedule: { ...ch.schedule, minGapSeconds: x } })} />
              <NumberField label='Max per session (0 = ∞)' value={ch.schedule.maxPerSession} min={0} max={1000} onChange={x => set({ ...ch, schedule: { ...ch.schedule, maxPerSession: x } })} />
              <NumberField label='Answer timeout (0 = none)' unit='s' value={ch.timeoutSeconds} min={0} max={600} onChange={x => set({ ...ch, timeoutSeconds: x })} />
              <Select label='Unanswered counts as' value={ch.unansweredAs} options={['skipped', 'missed'] as const} onChange={x => set({ ...ch, unansweredAs: x })} />
              <Select label='On negative answer, run event' value={ch.onNegativeEvent ?? ''} options={[{ value: '', label: 'Nothing (default)' }, ...eventIds.map(e => ({ value: e, label: e }))]} onChange={x => set({ ...ch, onNegativeEvent: x || undefined })} />
            </div>
            <MultiSelect label='Applicable phases' value={ch.phases} options={GAME_PHASES.map(p => ({ value: p, label: p }))} onChange={x => set({ ...ch, phases: x as typeof ch.phases })} />
            <ConditionField label='Only when' value={ch.conditions} onChange={x => set({ ...ch, conditions: x })} />
          </div>
        )}
      />
    </div>
  );
}

const ACCOUNTABLE_TYPES = SESSION_EVENT_TYPES.filter(t => !['session_started', 'session_ended', 'config_snapshot', 'termination'].includes(t));

function AccountingEditor({ config, update }: EditorProps) {
  const a = config.accounting;
  return (
    <div className='stack'>
      <div className='grid'>
        <Toggle label='Enable accounting' checked={a.enabled} onChange={x => update(c => setPath(c, 'accounting.enabled', x))} />
        <Toggle label='Count safety pauses' checked={a.includeSafetyPauses} onChange={x => update(c => setPath(c, 'accounting.includeSafetyPauses', x))} help='Off by default. Emergency stops and termination are never counted.' />
      </div>
      <ItemListEditor<AccountingRule>
        items={a.rules}
        label={r => `${r.enabled ? '' : '⏻ '}${r.label}`}
        validator={accountingRuleV as Validator<AccountingRule>}
        onSave={r => update(c => setPath(c, 'accounting.rules', upsert(c.accounting.rules, r)))}
        onRemove={id => update(c => setPath(c, 'accounting.rules', c.accounting.rules.filter(x => x.id !== id)))}
        onCreate={() => ({ id: uid('rule'), label: 'New rule', enabled: true, polarity: 'negative', types: ['check_answered'], points: 1, maxCount: 0, eventWeights: {}, notes: '' })}
        renderFields={(r, set) => (
          <div className='stack'>
            <div className='grid'>
              <Toggle label='Enabled' checked={r.enabled} onChange={x => set({ ...r, enabled: x })} />
              <TextField label='Label' value={r.label} onChange={x => set({ ...r, label: x })} />
              <Select label='Polarity' value={r.polarity} options={['positive', 'negative', 'neutral'] as const} onChange={x => set({ ...r, polarity: x })} />
              <NumberField label='Points per record' value={r.points} min={-1000} max={1000} step={0.5} onChange={x => set({ ...r, points: x })} />
              <NumberField label='Max counted (0 = ∞)' value={r.maxCount} min={0} max={100000} onChange={x => set({ ...r, maxCount: x })} />
            </div>
            <MultiSelect label='Logged record types' value={r.types} options={ACCOUNTABLE_TYPES.map(t => ({ value: t, label: t }))} onChange={x => x.length && set({ ...r, types: x as typeof r.types })} />
            <ConditionField label='Include when' value={r.include} onChange={x => set({ ...r, include: x })} help='Fields: type, source, eventId, data.* (e.g. data.value == "negative")' />
            <ConditionField label='Exclude when' value={r.exclude} onChange={x => set({ ...r, exclude: x })} />
            <TextField label='Notes' value={r.notes} onChange={x => set({ ...r, notes: x })} multiline />
          </div>
        )}
      />
    </div>
  );
}

function MediaEditor({ config, compiled, update }: EditorProps) {
  const [mediaId, setMediaId] = useState('');
  const m = config.media;
  return (
    <div className='stack'>
      <p className='muted'>Media ids look like <code>local:&lt;hash&gt;</code> or <code>e621:&lt;post id&gt;</code>. The current media id is shown in the session status panel and in session logs.</p>
      <Card title='Media tags' level={3}>
        <div className='row'>
          <input type='text' aria-label='Media id' placeholder='media id' value={mediaId} onChange={e => setMediaId(e.target.value)} style={{ maxWidth: 260 }} />
          <button type='button' className='small' disabled={!mediaId} onClick={() => update(c => setPath(c, 'media.tags', { ...c.media.tags, [mediaId]: c.media.tags[mediaId] ?? [] }))}>Add</button>
        </div>
        <table>
          <tbody>
            {Object.entries(m.tags).map(([id, tags]) => (
              <tr key={id}>
                <td><code>{id}</code></td>
                <td><TagInput label='Tags' value={tags} onChange={x => update(c => setPath(c, 'media.tags', { ...c.media.tags, [id]: x }))} /></td>
                <td><button type='button' className='small' onClick={() => update(c => { const t = { ...c.media.tags }; delete t[id]; return setPath(c, 'media.tags', t); })}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card title='Tag associations' level={3} actions={<button type='button' className='small' onClick={() => update(c => setPath(c, 'media.associations', [...c.media.associations, { tag: 'tag', events: [], styles: [], weightMultiplier: 2 }]))}>+ Association</button>}>
        {m.associations.map((a, n) => {
          const setA = (x: typeof a) => update(c => setPath(c, 'media.associations', c.media.associations.map((y, k) => (k === n ? x : y))));
          return (
            <div key={n} className='card'>
              <div className='grid'>
                <TextField label='Tag' value={a.tag} onChange={x => setA({ ...a, tag: x })} />
                <NumberField label='Weight multiplier' value={a.weightMultiplier} min={0} max={20} step={0.5} onChange={x => setA({ ...a, weightMultiplier: x })} />
              </div>
              <MultiSelect label='Boost events' value={a.events} options={(compiled.pack ? Object.values(compiled.pack.events) : []).filter(e => e.selectable).map(e => ({ value: e.id, label: e.name }))} onChange={x => setA({ ...a, events: x })} />
              <button type='button' className='small' onClick={() => update(c => setPath(c, 'media.associations', c.media.associations.filter((_, k) => k !== n)))}>Remove</button>
            </div>
          );
        })}
      </Card>
    </div>
  );
}

/** Fallback: validated JSON editing of any category's config slice. */
function JsonCategoryEditor({ config, update, def }: EditorProps) {
  const paths = Array.isArray(def.path) ? def.path : [def.path];
  return (
    <div className='stack'>
      {paths.map(path => (
        <JsonEditor
          key={path}
          label={`config.${path}`}
          value={getPath(config, path)}
          onCommit={value => update(c => setPath(c, path, value))}
          extraCheck={value => {
            const r = validate(forgeConfigV, setPath(config, path, value));
            return r.ok ? [] : r.issues.slice(0, 10).map(i => `${i.path}: ${i.message}`);
          }}
        />
      ))}
    </div>
  );
}

const EDITORS: Record<string, (p: EditorProps) => ReactNode> = {
  identityPicker: IdentityPicker,
  identityEditor: IdentityEditor,
  dictionaryEditor: DictionaryEditor,
  pronounEditor: PronounEditor,
  anatomyEditor: AnatomyEditor,
  styleMix: StyleMixEditor,
  styleEditor: StyleEditor,
  hypnoEditor: HypnoEditor,
  sessionEditor: SessionEditor,
  eventEditor: EventEditor,
  mediaEditor: MediaEditor,
  promptEditor: PromptEditor,
  checkEditor: CheckEditor,
  accountingEditor: AccountingEditor,
  loggingEditor: LoggingEditor,
  safetyEditor: SafetyEditor,
  accessibilityEditor: AccessibilityEditor,
};

export function CategoryEditor(props: EditorProps) {
  const Editor = EDITORS[props.def.editor] ?? JsonCategoryEditor;
  const [raw, setRaw] = useState(false);
  const content = useMemo(() => (raw ? <JsonCategoryEditor {...props} /> : <Editor {...props} />), [raw, props, Editor]);
  return (
    <div className='stack'>
      {Editor !== JsonCategoryEditor && (
        <Toggle label='Show raw JSON for this category' checked={raw} onChange={setRaw} />
      )}
      {content}
    </div>
  );
}


/**
 * Default event pack. The first eight events are data-driven ports of the
 * original joi.how dice outcomes (random/half/double/rising pace, pause,
 * random grip, clean up, climax), with the original "1 in N" odds kept as
 * weights for the "dice" selection strategy. The remaining events show
 * identity-specific narration, history-dependent conditions, weighted
 * branching and bounded loops.
 *
 * Intensity uses a 0–10 scale (original: 0–100%).
 */
import { EventPack, EVENT_SCHEMA_VERSION } from './types';

export const DEFAULT_EVENT_PACK: EventPack = {
  kind: 'forge.eventPack',
  schemaVersion: EVENT_SCHEMA_VERSION,
  id: 'core',
  name: 'Core events',
  description: 'Ports of the original dice outcomes plus identity-aware examples.',
  groups: [
    {
      id: 'calibration_outcomes',
      name: 'Calibration outcomes',
      mode: 'weighted',
      members: [
        { event: 'calibration_pass', weight: 3 },
        { event: 'calibration_adjust', weight: 1 },
      ],
    },
  ],
  sequences: [],
  events: [
    {
      id: 'random_pace', name: 'Random pace', type: 'pace', description: 'Pick a new pace within the session limits.',
      enabled: true, weight: 10, selectable: true, tags: ['pace'], intensity: { min: 0, max: 10 },
      identities: [], styles: [], mediaTags: [], phases: ['active'], cooldownSeconds: 0, maxRepeats: 0, noRepeatWithin: 0, metadata: { origin: 'joi.how dice' },
      steps: [
        { do: 'setPace', random: true },
        { do: 'message', title: 'Change the pace!', durationSeconds: 5 },
      ],
    },
    {
      id: 'half_pace', name: 'Half pace', type: 'pace', description: 'Half the current pace for a few seconds.',
      enabled: true, weight: 50, selectable: true, tags: ['pace'], intensity: { min: 1, max: 5 },
      identities: [], styles: [], mediaTags: [], phases: ['active'], cooldownSeconds: 0, maxRepeats: 0, noRepeatWithin: 0, metadata: { origin: 'joi.how dice' },
      steps: [
        { do: 'setPace', multiply: 0.5 },
        { do: 'countdown', from: 3, intervalSeconds: 6, title: 'Half pace!' },
        { do: 'message', title: 'Done! Back to normal pace', durationSeconds: 5 },
        { do: 'setPace', random: true },
      ],
    },
    {
      id: 'double_pace', name: 'Double pace', type: 'pace', description: 'Twice the current pace for a few seconds.',
      enabled: true, weight: 40, selectable: true, tags: ['pace'], intensity: { min: 2, max: 10 },
      identities: [], styles: [], mediaTags: [], phases: ['active'], cooldownSeconds: 0, maxRepeats: 0, noRepeatWithin: 0, metadata: { origin: 'joi.how dice' },
      steps: [
        { do: 'setPace', multiply: 2 },
        { do: 'countdown', from: 3, intervalSeconds: 3, title: 'Double pace!' },
        { do: 'message', title: 'Done! Back to normal pace', durationSeconds: 5 },
        { do: 'setPace', random: true },
      ],
    },
    {
      id: 'rising_pace', name: 'Rising pace', type: 'pace', description: 'Start from the lowest pace and slowly pick up speed.',
      enabled: true, weight: 30, selectable: true, tags: ['pace'], intensity: { min: 3, max: 10 },
      identities: [], styles: [], mediaTags: [], phases: ['active'], cooldownSeconds: 0, maxRepeats: 0, noRepeatWithin: 0, metadata: { origin: 'joi.how dice' },
      steps: [
        { do: 'message', title: 'Rising pace strokes!', durationSeconds: 5 },
        { do: 'rampPace', from: 'min', to: 'max', durationSeconds: 30, steps: 6 },
        { do: 'message', title: 'Stay at this pace for a bit', durationSeconds: 10 },
        { do: 'wait', seconds: 15 },
        { do: 'setPace', random: true },
      ],
    },
    {
      id: 'scripted_pause', name: 'Pause', type: 'pause', description: 'A scripted break in the action (distinct from the user pause button).',
      enabled: true, weight: 50, selectable: true, tags: ['pause'], intensity: { min: 1.5, max: 10 },
      identities: [], styles: [], mediaTags: [], phases: ['active'], cooldownSeconds: 0, maxRepeats: 0, noRepeatWithin: 0, metadata: { origin: 'joi.how dice' },
      steps: [
        { do: 'setPhase', phase: 'break' },
        { do: 'message', title: 'Stop {actioning}!', durationSeconds: 5 },
        { do: 'wait', seconds: [10, 25] },
        { do: 'message', title: 'Start {actioning} again!', durationSeconds: 5 },
        { do: 'setPhase', phase: 'active' },
      ],
    },
    {
      id: 'random_grip', name: 'Random grip', type: 'grip', description: 'Switch which hand(s) to use.',
      enabled: true, weight: 50, selectable: true, tags: ['grip'], intensity: { min: 0, max: 10 },
      identities: [], styles: [], mediaTags: [], phases: ['active'], cooldownSeconds: 0, maxRepeats: 0, noRepeatWithin: 0, metadata: { origin: 'joi.how dice' },
      steps: [
        { do: 'grip' },
        { do: 'message', title: 'Grip changed to {grip}!', durationSeconds: 5 },
      ],
    },
    {
      id: 'clean_up', name: 'Clean up', type: 'cleanup', description: 'Pause to clean up; waits for acknowledgment (skippable).',
      enabled: true, weight: 25, selectable: true, tags: ['cleanup'], intensity: { min: 7.5, max: 10 },
      identities: [], styles: [], mediaTags: [], phases: ['active'], cooldownSeconds: 0, maxRepeats: 1, noRepeatWithin: 0, metadata: { origin: 'joi.how dice' },
      steps: [
        { do: 'setPhase', phase: 'break' },
        { do: 'message', title: 'Clean up any mess you’ve made along the way.' },
        { do: 'check', checkId: 'cleanup_done' },
        { do: 'message', title: 'Start {actioning} again.', durationSeconds: 5 },
        { do: 'setPhase', phase: 'active' },
      ],
    },
    {
      id: 'climax', name: 'Climax', type: 'climax', description: 'The end point: edge, then the configured climax/deny/ruin odds decide.',
      enabled: true, weight: 1, selectable: true, tags: ['climax'], intensity: { min: 10, max: 10 },
      identities: [], styles: [], mediaTags: [], phases: ['active'], cooldownSeconds: 0, maxRepeats: 0, noRepeatWithin: 0, metadata: { origin: 'joi.how dice' },
      steps: [
        { do: 'setPace', snap: 'min' },
        { do: 'message', title: 'You should be getting close to the edge. Don’t cum yet.', durationSeconds: 10 },
        { do: 'wait', seconds: 10 },
        { do: 'setPace', snap: 'max' },
        { do: 'message', title: 'Keep going!', durationSeconds: 20 },
        { do: 'wait', seconds: 20 },
        { do: 'setPhase', phase: 'finale' },
        { do: 'check', checkId: 'edging' },
        {
          do: 'branch', mode: 'first', branches: [
            { when: 'answers.edging == "no"', weight: 1, goto: 'climax_cant' },
            { weight: 1, goto: 'climax_resolve' },
          ],
        },
      ],
    },
    {
      id: 'climax_resolve', name: 'Climax: resolve', type: 'climax', description: 'Countdown and roll the climax odds.',
      enabled: true, weight: 0, selectable: false, tags: ['climax'], intensity: { min: 0, max: 10 },
      identities: [], styles: [], mediaTags: [], phases: ['active'], cooldownSeconds: 0, maxRepeats: 0, noRepeatWithin: 0, metadata: {},
      steps: [
        { do: 'setPace', snap: 'min' },
        { do: 'message', title: 'Stay on the edge, {noun}' },
        { do: 'countdown', from: 3, intervalSeconds: 5 },
        { do: 'climax' },
        {
          do: 'branch', mode: 'first', branches: [
            { when: 'vars.climaxResult == "denied"', weight: 1, goto: 'climax_denied' },
            { when: 'vars.climaxResult == "ruined"', weight: 1, goto: 'climax_ruined' },
            { weight: 1, goto: 'climax_finish' },
          ],
        },
      ],
    },
    {
      id: 'climax_finish', name: 'Climax: cum', type: 'climax', enabled: true, weight: 0, selectable: false, description: '',
      tags: ['climax'], intensity: { min: 0, max: 10 }, identities: [], styles: [], mediaTags: [], phases: ['active', 'finale'],
      cooldownSeconds: 0, maxRepeats: 0, noRepeatWithin: 0, metadata: {},
      steps: [
        { do: 'message', title: 'Cum!' },
        { do: 'marker', label: 'climax' },
        { do: 'wait', seconds: 10 },
        { do: 'end', reason: 'climax' },
      ],
    },
    {
      id: 'climax_ruined', name: 'Climax: ruined', type: 'climax', enabled: true, weight: 0, selectable: false, description: '',
      tags: ['climax'], intensity: { min: 0, max: 10 }, identities: [], styles: [], mediaTags: [], phases: ['active', 'finale'],
      cooldownSeconds: 0, maxRepeats: 0, noRepeatWithin: 0, metadata: {},
      steps: [
        { do: 'message', title: '{HANDS} OFF! Ruin it!' },
        { do: 'marker', label: 'ruined' },
        { do: 'wait', seconds: 10 },
        { do: 'end', reason: 'ruined' },
      ],
    },
    {
      id: 'climax_denied', name: 'Climax: denied', type: 'climax', enabled: true, weight: 0, selectable: false, description: '',
      tags: ['climax'], intensity: { min: 0, max: 10 }, identities: [], styles: [], mediaTags: [], phases: ['active', 'finale'],
      cooldownSeconds: 0, maxRepeats: 0, noRepeatWithin: 0, metadata: {},
      steps: [
        { do: 'setPhase', phase: 'break' },
        { do: 'message', title: '{HANDS} OFF! Do not cum!' },
        { do: 'marker', label: 'denied' },
        { do: 'wait', seconds: 5 },
        { do: 'message', title: 'Good {noun}. Let {themself} cool off.' },
        { do: 'wait', seconds: 5 },
        { do: 'end', reason: 'denied' },
      ],
    },
    {
      id: 'climax_cant', name: 'Climax: not ready', type: 'climax', enabled: true, weight: 0, selectable: false, description: 'Break, reset intensity, resume.',
      tags: ['climax'], intensity: { min: 0, max: 10 }, identities: [], styles: [], mediaTags: [], phases: ['active', 'finale'],
      cooldownSeconds: 0, maxRepeats: 0, noRepeatWithin: 0, metadata: {},
      steps: [
        { do: 'setPhase', phase: 'break' },
        { do: 'message', title: 'Stop for a moment.', durationSeconds: 20 },
        { do: 'intensity', add: -10 },
        { do: 'wait', seconds: 20 },
        { do: 'setPace', snap: 'min' },
        { do: 'message', title: 'Start to {action} again', durationSeconds: 5 },
        { do: 'setPhase', phase: 'active' },
      ],
    },

    // --- Identity-aware examples -------------------------------------------------
    {
      id: 'ambient_narration', name: 'Ambient narration', type: 'narration', description: 'A line composed from the active narrative-style mix.',
      enabled: true, weight: 60, selectable: true, tags: ['narration'], intensity: { min: 0, max: 10 },
      identities: [], styles: [], mediaTags: [], phases: ['active'], cooldownSeconds: 8, maxRepeats: 0, noRepeatWithin: 0, metadata: {},
      steps: [{ do: 'narrate', styles: [], durationSeconds: 6 }],
    },
    {
      id: 'clinical_observation', name: 'Clinical observation', type: 'narration',
      description: 'Identity-specific: research-note narration for the scientific subject.',
      enabled: true, weight: 30, selectable: true, tags: ['narration', 'identity'], intensity: { min: 1, max: 10 },
      identities: ['scientific_subject', 'specimen'], styles: [], mediaTags: [], phases: ['active'],
      conditions: { all: [{ field: 'session.intensity', operator: 'greaterThanOrEqual', value: 2 }] },
      cooldownSeconds: 30, maxRepeats: 0, noRepeatWithin: 2, metadata: {},
      steps: [
        { do: 'narrate', template: '{Term:research_notes}: {subject} {verb:remain} {term:results} at intensity {intensity}.', styles: [], durationSeconds: 6 },
        { do: 'prompt', promptId: 'record_observation' },
      ],
    },
    {
      id: 'stillness_after_pauses', name: 'Stillness drill', type: 'narration',
      description: 'History-dependent: only after the user has paused at least twice and no stillness drill ran recently.',
      enabled: true, weight: 20, selectable: true, tags: ['narration', 'history'], intensity: { min: 2, max: 8 },
      identities: [], styles: [], mediaTags: [], phases: ['active'],
      conditions: 'session.pauses >= 2 and history.last != "stillness_after_pauses"',
      cooldownSeconds: 120, maxRepeats: 3, noRepeatWithin: 0, metadata: {},
      steps: [
        { do: 'setPace', snap: 'min' },
        { do: 'narrate', template: 'A {object} that keeps stopping must learn stillness. Slow, {noun}.', styles: [], durationSeconds: 8 },
        { do: 'wait', seconds: 15 },
        { do: 'setPace', random: true },
      ],
    },
    {
      id: 'automaton_calibration', name: 'Calibration routine', type: 'sequence',
      description: 'Bounded loop with weighted branching: three calibration cycles, then a weighted outcome.',
      enabled: true, weight: 25, selectable: true, tags: ['sequence', 'identity'], intensity: { min: 2, max: 9 },
      identities: ['automaton', 'tool', 'instrument'], styles: [], mediaTags: [], phases: ['active'],
      cooldownSeconds: 90, maxRepeats: 4, noRepeatWithin: 0, metadata: {},
      loop: { times: 3, until: 'session.intensity >= 9' },
      steps: [
        { do: 'narrate', template: 'Calibration cycle. {Term:commands}.', styles: ['mechanical_language'], durationSeconds: 4 },
        { do: 'setPace', multiply: 1.25 },
        { do: 'wait', seconds: 6 },
      ],
      next: 'calibration_outcomes',
    },
    {
      id: 'calibration_pass', name: 'Calibration: pass', type: 'narration', enabled: true, weight: 0, selectable: false, description: '',
      tags: ['identity'], intensity: { min: 0, max: 10 }, identities: [], styles: [], mediaTags: [], phases: ['active'],
      cooldownSeconds: 0, maxRepeats: 0, noRepeatWithin: 0, metadata: {},
      steps: [
        { do: 'narrate', template: '{Term:acknowledgments}. {Term:diagnostics}.', styles: [], durationSeconds: 5 },
        { do: 'stat', name: 'calibrations_passed', add: 1 },
        { do: 'setPace', random: true },
      ],
    },
    {
      id: 'calibration_adjust', name: 'Calibration: adjust', type: 'check', enabled: true, weight: 0, selectable: false, description: '',
      tags: ['identity'], intensity: { min: 0, max: 10 }, identities: [], styles: [], mediaTags: [], phases: ['active'],
      cooldownSeconds: 0, maxRepeats: 0, noRepeatWithin: 0, metadata: {},
      steps: [
        { do: 'narrate', template: 'Deviation detected. {Subject} {verb:require} adjustment.', styles: [], durationSeconds: 5 },
        { do: 'check', checkId: 'instruction_following' },
        { do: 'setPace', snap: 'min' },
      ],
    },
    {
      id: 'oracle_mantra', name: 'Oracle mantra', type: 'narration',
      description: 'Bounded loop: a short repeated ritual line, four times.',
      enabled: true, weight: 20, selectable: true, tags: ['narration', 'identity'], intensity: { min: 0, max: 10 },
      identities: ['oracle', 'deity', 'muse'], styles: [], mediaTags: [], phases: ['active'],
      cooldownSeconds: 60, maxRepeats: 0, noRepeatWithin: 1, metadata: {},
      loop: { times: 4 },
      steps: [
        { do: 'narrate', template: '{Term:symbolic}… {term:ritual}…', styles: [], durationSeconds: 3 },
        { do: 'wait', seconds: 3 },
      ],
    },
  ],
};

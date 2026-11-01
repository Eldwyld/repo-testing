# F. Event engine demonstration

All output on this page was produced by running the code in this repository (a scratch Vitest script that
calls `compilePack`, `explainEligibility`, `engineTrigger` and `engineTick`). It was not written by hand.
The same behaviours are asserted in `tests/forge/events.test.ts`.

## Example definitions

### 1. Identity-specific narration event

```json
{
  "id": "clinical_observation",
  "name": "Clinical observation",
  "type": "narration",
  "enabled": true,
  "weight": 30,
  "selectable": true,
  "identities": ["scientific_subject", "specimen"],
  "intensity": { "min": 1, "max": 10 },
  "phases": ["active"],
  "conditions": { "all": [{ "field": "session.intensity", "operator": "greaterThanOrEqual", "value": 2 }] },
  "cooldownSeconds": 30,
  "noRepeatWithin": 2,
  "steps": [
    { "do": "narrate", "template": "{Term:research_notes}: {subject} {verb:remain} {term:results} at intensity {intensity}.", "durationSeconds": 6 },
    { "do": "prompt", "promptId": "record_observation" }
  ]
}
```

The template is resolved through the active identity's dictionaries. With the Scientific subject identity
(third person, they/them), the runtime renders lines such as *"Addendum: the subject remains consistent with
hypothesis at intensity 3."* (actual output for seed `s2`) The verb agrees with the noun subject, not with the pronoun.

### 2. Conditional event depending on session history (DSL condition)

```json
{
  "id": "stillness_after_pauses",
  "name": "Stillness drill",
  "type": "narration",
  "weight": 20,
  "intensity": { "min": 2, "max": 8 },
  "conditions": "session.pauses >= 2 and history.last != \"stillness_after_pauses\"",
  "cooldownSeconds": 120,
  "maxRepeats": 3,
  "steps": [
    { "do": "setPace", "snap": "min" },
    { "do": "narrate", "template": "A {object} that keeps stopping must learn stillness. Slow, {noun}.", "durationSeconds": 8 },
    { "do": "wait", "seconds": 15 },
    { "do": "setPace", "random": true }
  ]
}
```

The DSL string is parsed into the JSON condition tree at load time. It is never executed.

### 3. Bounded sequence with a loop and weighted selection

```json
{
  "id": "automaton_calibration",
  "name": "Calibration routine",
  "type": "sequence",
  "weight": 25,
  "identities": ["automaton", "tool", "instrument"],
  "intensity": { "min": 2, "max": 9 },
  "cooldownSeconds": 90,
  "maxRepeats": 4,
  "loop": { "times": 3, "until": "session.intensity >= 9" },
  "steps": [
    { "do": "narrate", "template": "Calibration cycle. {Term:commands}.", "styles": ["mechanical_language"], "durationSeconds": 4 },
    { "do": "setPace", "multiply": 1.25 },
    { "do": "wait", "seconds": 6 }
  ],
  "next": "calibration_outcomes"
}
```

with the weighted group it chains into:

```json
{ "id": "calibration_outcomes", "name": "Calibration outcomes", "mode": "weighted",
  "members": [ { "event": "calibration_pass", "weight": 3 }, { "event": "calibration_adjust", "weight": 1 } ] }
```

## Validation of the default pack

```
compilePack(DEFAULT_EVENT_PACK) → {"ok": true, "errors": [], "warnings": []}
```

## Selection: representative input → eligibility

Input: intensity 3, phase `active`, identity `scientific_subject`, 2 pauses so far (`explainEligibility`).

| Event | Eligible | Reason |
|---|---|---|
| `random_pace` | yes |  |
| `half_pace` | yes |  |
| `double_pace` | yes |  |
| `rising_pace` | yes |  |
| `scripted_pause` | yes |  |
| `random_grip` | yes |  |
| `clean_up` | no | intensity 3.0 outside 7.5–10 |
| `climax` | no | intensity 3.0 outside 10–10 |
| `climax_resolve` | no | not selectable (chain-only) |
| `climax_finish` | no | not selectable (chain-only) |
| `climax_ruined` | no | not selectable (chain-only) |
| `climax_denied` | no | not selectable (chain-only) |
| `climax_cant` | no | not selectable (chain-only) |
| `ambient_narration` | yes |  |
| `clinical_observation` | yes |  |
| `stillness_after_pauses` | yes |  |
| `automaton_calibration` | no | identity "scientific_subject" not allowed |
| `calibration_pass` | no | not selectable (chain-only) |
| `calibration_adjust` | no | not selectable (chain-only) |
| `oracle_mantra` | no | identity "scientific_subject" not allowed |

With the `weighted` strategy, one eligible event is then drawn in proportion to its weight. The `dice`
strategy instead reproduces the original joi.how odds (weight N = "1 in N", and weight 1 is guaranteed, which
is how `climax` fires at intensity 10).

## Execution: triggering the identity-specific event

`engineTrigger(pack, opts, createEngineState("demo-seed"), input({ intensity: 3 }), "clinical_observation")`:

```json
{
  "effects": [
    {
      "type": "narrate",
      "eventId": "clinical_observation",
      "template": "{Term:research_notes}: {subject} {verb:remain} {term:results} at intensity {intensity}.",
      "styles": [],
      "durationMs": 6000
    },
    {
      "type": "prompt",
      "eventId": "clinical_observation",
      "promptId": "record_observation"
    }
  ],
  "log": [
    {
      "type": "event_selected",
      "at": 0,
      "eventId": "clinical_observation",
      "data": {
        "strategy": "trigger"
      }
    },
    {
      "type": "event_started",
      "at": 0,
      "eventId": "clinical_observation",
      "data": {
        "depth": 0,
        "eventType": "narration",
        "tags": [
          "narration",
          "identity"
        ]
      }
    },
    {
      "type": "event_completed",
      "at": 0,
      "eventId": "clinical_observation",
      "data": {
        "iterations": 1
      }
    }
  ]
}
```

The prompt is non-blocking here, because no `blocking` callback was supplied. In a session, a prompt with
`blocking: true` holds the chain until it is submitted or skipped.

## Execution: bounded loop, then a weighted group (automaton identity, 500 ms ticks)

Engine log:

```
     0 ms  event_selected   automaton_calibration  {"strategy": "trigger"}
     0 ms  event_started    automaton_calibration  {"depth": 0, "eventType": "sequence", "tags": ["sequence", "identity"]}
 18000 ms  event_completed  automaton_calibration  {"iterations": 3}
 18000 ms  event_started    calibration_adjust  {"depth": 1, "eventType": "check", "tags": ["identity"]}
 18000 ms  event_completed  calibration_adjust  {"iterations": 1}
```

Effects, in order:

```
{"type": "narrate", "eventId": "automaton_calibration", "template": "Calibration cycle. {Term:commands}.", "styles": ["mechanical_language"], "durationMs": 4000}
{"type": "setPace", "eventId": "automaton_calibration", "value": 2.5}
{"type": "narrate", "eventId": "automaton_calibration", "template": "Calibration cycle. {Term:commands}.", "styles": ["mechanical_language"], "durationMs": 4000}
{"type": "setPace", "eventId": "automaton_calibration", "value": 2.5}
{"type": "narrate", "eventId": "automaton_calibration", "template": "Calibration cycle. {Term:commands}.", "styles": ["mechanical_language"], "durationMs": 4000}
{"type": "setPace", "eventId": "automaton_calibration", "value": 2.5}
{"type": "narrate", "eventId": "calibration_adjust", "template": "Deviation detected. {Subject} {verb:require} adjustment.", "styles": [], "durationMs": 5000}
{"type": "check", "eventId": "calibration_adjust", "checkId": "instruction_following"}
{"type": "setPace", "eventId": "calibration_adjust", "value": 1}
```

The loop body ran exactly 3 times (`iterations: 3`, 18 s of waits). Then `next` resolved the weighted group,
and this seed drew `calibration_adjust` (1 in 4 odds). Pace values are clamped by the runtime to the session's
pace limits (here 1–5).

## Failure examples

`compilePack` returns diagnostics that name the event and path, and returns no pack when there are errors:

```json
{
  "invalidReference": [
    {
      "code": "invalid_reference",
      "message": "reference to unknown event/group/sequence \"missing_event\"",
      "eventId": "a",
      "path": "events[0].steps[0].target"
    }
  ],
  "malformedCondition": [
    {
      "code": "dsl",
      "message": "expected a value (at character 20)",
      "eventId": "b",
      "path": "events[0].conditions"
    }
  ],
  "malformedJsonCondition": [
    {
      "code": "schema",
      "message": "between: min exceeds max (always false)",
      "path": "events[0].conditions",
      "eventId": "c"
    }
  ],
  "unboundedLoop": [
    {
      "code": "unbounded_loop",
      "message": "cycle ping -> pong -> ping has no exit bound; set maxRepeats or terminateIf on one of its events, or use a \"loop\" block",
      "eventId": "ping"
    }
  ],
  "loopTooLong": [
    {
      "code": "schema",
      "message": "must be <= 50",
      "path": "events[0].loop.times",
      "eventId": "d"
    }
  ],
  "evalAttempt": [
    {
      "code": "dsl",
      "message": "expected an operator after \"constructor.constructor\" (at character 24)",
      "eventId": "e",
      "path": "events[0].conditions"
    }
  ]
}
```

- **Invalid reference**: `goto` to an id that does not exist.
- **Malformed condition**: `>>=` is not an operator, and the error gives the character position.
- **Malformed JSON condition**: `between` with min > max.
- **Prohibited loop**: `ping → pong → ping` with no `maxRepeats` or `terminateIf`.
- **Loop bound**: `loop.times` greater than 50.
- **Code injection attempt**: `constructor.constructor("alert(1)")()` is rejected by the restricted grammar. It
  can never be evaluated, because no code path evaluates strings.

Runtime guards cover what static checks cannot see. A chain longer than `maxChainDepth`, or more than
`maxStepsPerTick` steps in one tick, logs an `engine_error`, aborts the chain and leaves the session running
(see the tests "aborts runaway chains…" and "caps steps per tick…").

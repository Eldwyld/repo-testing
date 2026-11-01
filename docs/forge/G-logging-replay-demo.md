# G. Session logging and replay demonstration

Produced by running `SessionRuntime` headlessly. The settings were: seed `log-demo`, the Scientific subject
identity, clinical and scientific styles, a 120 s intensity ramp, and instruction checks about 4 per minute.
The scripted user answered checks "yes, yes, no…", paused at 30 s for 8 s, and stopped at 90 s. The record
has 120 events. The excerpt below shows the first ~40, skipping most of the throttled
`intensity_changed` entries.

## Chronological event log (excerpt)

```jsonl
{"id": "e000001", "t": 0, "activeMs": 0, "type": "session_started", "source": "system", "data": {"intensity": 0, "pace": 1, "phase": "active", "seed": "log-demo", "identityId": "scientific_subject", "anatomyId": "anatomy.penis", "configHash": "d0db080bbf9e9e53"}}
{"id": "e000002", "t": 0, "activeMs": 0, "type": "identity_set", "source": "system", "data": {"identityId": "scientific_subject", "category": "scientific_subject", "pronouns": "they", "person": "third"}}
{"id": "e000003", "t": 0, "activeMs": 0, "type": "styles_set", "source": "system", "data": {"styles": ["clinical_detachment", "scientific_observation"]}}
{"id": "e000004", "t": 0, "activeMs": 0, "type": "pace_changed", "source": "system", "data": {"value": 1, "previousValue": null}}
{"id": "e000005", "t": 0, "activeMs": 0, "type": "phase_changed", "source": "system", "data": {"value": "active"}}
{"id": "e000006", "t": 50, "activeMs": 50, "type": "intensity_changed", "source": "system", "data": {"value": 0, "previousValue": null}}
{"id": "e000007", "t": 1300, "activeMs": 1300, "type": "intensity_changed", "source": "system", "data": {"value": 0.11, "previousValue": 0}}
{"id": "e000008", "t": 2500, "activeMs": 2500, "type": "intensity_changed", "source": "system", "data": {"value": 0.21, "previousValue": 0.11}}
{"id": "e000009", "t": 3400, "activeMs": 3400, "type": "check_shown", "source": "system", "data": {"checkId": "instruction_following", "instanceId": "c1", "kind": "instruction", "text": "Are you following the current instruction?"}}
{"id": "e000010", "t": 3400, "activeMs": 3400, "type": "check_answered", "source": "user", "data": {"checkId": "instruction_following", "instanceId": "c1", "kind": "instruction", "response": "yes", "value": "positive", "latencyMs": 0}}
{"id": "e000011", "t": 3750, "activeMs": 3750, "type": "intensity_changed", "source": "system", "data": {"value": 0.31, "previousValue": 0.21}}
{"id": "e000013", "t": 6050, "activeMs": 6050, "type": "event_selected", "source": "engine", "data": {"strategy": "weighted", "rng": 8}, "eventId": "ambient_narration"}
{"id": "e000014", "t": 6050, "activeMs": 6050, "type": "event_started", "source": "engine", "data": {"depth": 0, "eventType": "narration", "tags": ["narration"], "count": 1, "name": "Ambient narration"}, "eventId": "ambient_narration"}
{"id": "e000015", "t": 6050, "activeMs": 6050, "type": "event_completed", "source": "engine", "data": {"iterations": 1}, "eventId": "ambient_narration"}
{"id": "e000016", "t": 6050, "activeMs": 6050, "type": "narration_shown", "source": "engine", "data": {"text": "The protocol continues without deviation.", "styleId": "scientific_observation"}, "eventId": "ambient_narration"}
{"id": "e000021", "t": 11050, "activeMs": 11050, "type": "event_selected", "source": "engine", "data": {"strategy": "weighted", "rng": 12}, "eventId": "random_grip"}
{"id": "e000022", "t": 11050, "activeMs": 11050, "type": "event_started", "source": "engine", "data": {"depth": 0, "eventType": "grip", "tags": ["grip"], "count": 1, "name": "Random grip"}, "eventId": "random_grip"}
{"id": "e000023", "t": 11050, "activeMs": 11050, "type": "event_completed", "source": "engine", "data": {"iterations": 1}, "eventId": "random_grip"}
{"id": "e000024", "t": 11050, "activeMs": 11050, "type": "grip_changed", "source": "engine", "data": {"value": "right"}, "eventId": "random_grip"}
{"id": "e000025", "t": 11050, "activeMs": 11050, "type": "message_shown", "source": "engine", "data": {"title": "Grip changed to right hand!", "description": null}, "eventId": "random_grip"}
{"id": "e000030", "t": 16050, "activeMs": 16050, "type": "event_selected", "source": "engine", "data": {"strategy": "weighted", "rng": 17}, "eventId": "ambient_narration"}
{"id": "e000031", "t": 16050, "activeMs": 16050, "type": "event_started", "source": "engine", "data": {"depth": 0, "eventType": "narration", "tags": ["narration"], "count": 2, "name": "Ambient narration"}, "eventId": "ambient_narration"}
{"id": "e000032", "t": 16050, "activeMs": 16050, "type": "event_completed", "source": "engine", "data": {"iterations": 1}, "eventId": "ambient_narration"}
{"id": "e000033", "t": 16050, "activeMs": 16050, "type": "narration_shown", "source": "engine", "data": {"text": "Response noted in the genital tissue.", "styleId": "clinical_detachment"}, "eventId": "ambient_narration"}
{"id": "e000037", "t": 18850, "activeMs": 18850, "type": "check_shown", "source": "system", "data": {"checkId": "instruction_following", "instanceId": "c2", "kind": "instruction", "text": "Are you following the current instruction?"}}
{"id": "e000038", "t": 18900, "activeMs": 18900, "type": "check_answered", "source": "user", "data": {"checkId": "instruction_following", "instanceId": "c2", "kind": "instruction", "response": "yes", "value": "positive", "latencyMs": 50}}
{"id": "e000044", "t": 25050, "activeMs": 25050, "type": "event_selected", "source": "engine", "data": {"strategy": "weighted", "rng": 25}, "eventId": "half_pace"}
{"id": "e000045", "t": 25050, "activeMs": 25050, "type": "event_started", "source": "engine", "data": {"depth": 0, "eventType": "pace", "tags": ["pace"], "count": 1, "name": "Half pace"}, "eventId": "half_pace"}
{"id": "e000046", "t": 25050, "activeMs": 25050, "type": "message_shown", "source": "engine", "data": {"title": "Half pace!", "description": "3..."}, "eventId": "half_pace"}
{"id": "e000051", "t": 30000, "activeMs": 30000, "type": "pause", "source": "user", "data": {"reason": "user"}}
{"id": "e000052", "t": 38000, "activeMs": 30000, "type": "resume", "source": "user", "data": {}}
{"id": "e000054", "t": 39050, "activeMs": 31050, "type": "message_shown", "source": "engine", "data": {"title": "Half pace!", "description": "2..."}, "eventId": "half_pace"}
{"id": "e000059", "t": 43350, "activeMs": 35350, "type": "check_shown", "source": "system", "data": {"checkId": "instruction_following", "instanceId": "c3", "kind": "instruction", "text": "Are you following the current instruction?"}}
{"id": "e000060", "t": 43400, "activeMs": 35400, "type": "check_answered", "source": "user", "data": {"checkId": "instruction_following", "instanceId": "c3", "kind": "instruction", "response": "no", "value": "negative", "latencyMs": 50}}
{"id": "e000062", "t": 45050, "activeMs": 37050, "type": "message_shown", "source": "engine", "data": {"title": "Half pace!", "description": "1..."}, "eventId": "half_pace"}
{"id": "e000068", "t": 51050, "activeMs": 43050, "type": "event_completed", "source": "engine", "data": {"iterations": 1}, "eventId": "half_pace"}
{"id": "e000069", "t": 51050, "activeMs": 43050, "type": "message_shown", "source": "engine", "data": {"title": "Done! Back to normal pace", "description": null}, "eventId": "half_pace"}
{"id": "e000070", "t": 51050, "activeMs": 43050, "type": "pace_changed", "source": "engine", "data": {"value": 4.58, "previousValue": 1}, "eventId": "half_pace"}
{"id": "e000080", "t": 62100, "activeMs": 54100, "type": "event_selected", "source": "engine", "data": {"strategy": "weighted", "rng": 36}, "eventId": "random_pace"}
{"id": "e000081", "t": 62100, "activeMs": 54100, "type": "event_started", "source": "engine", "data": {"depth": 0, "eventType": "pace", "tags": ["pace"], "count": 1, "name": "Random pace"}, "eventId": "random_pace"}
```

Things to note:

- `t` is wall time and `activeMs` is engine time. The 8 s pause separates them from `e000052` on.
- Each discrete change is recorded verbatim with its previous value. Intensity grows continuously, so it is
  throttled to steps of 0.1 or more, or one entry every 5 s.
- Every record has a stable id and a `source` (user, engine, system or safety). Engine records carry the
  `eventId` of the event definition that caused them.
- The half-pace countdown resumes after the pause on the active clock: "3…" at active 25 050, "2…" at 31 050.

Replay metadata stored with the record:

```json
{
  "engineVersion": 1,
  "appVersion": "3.0.1",
  "seed": "log-demo",
  "configHash": "d0db080bbf9e9e53",
  "configEmbedded": true,
  "tickMs": 50,
  "mediaEmbedded": false,
  "notes": []
}
```

## Reconstructing intensity and pace curves

`intensityCurve(events)` and `paceCurve(events)` (`session/analysis.ts`) build **step functions**. Each
`*_changed` record starts a segment that holds until the next one. The initial value comes from
`session_started.data`. `valueAt(curve, t)` uses binary search to find the last point at or before `t`. Either
clock can be used: `t` for the timeline chart, `activeMs` for ghost alignment.

Pace curve (every point):

```json
[
  { "t": 0, "v": 1 },
  { "t": 51050, "v": 4.58 },
  { "t": 62100, "v": 3.76 },
  { "t": 70100, "v": 5 },
  { "t": 79100, "v": 1.61 }
]
```

Intensity curve (every 6th point): the flat stretch between 28 550 and 42 850 ms is the pause.

```json
[
  { "t": 0, "v": 0 },
  { "t": 6250, "v": 0.52 },
  { "t": 13750, "v": 1.15 },
  { "t": 21250, "v": 1.77 },
  { "t": 28550, "v": 2.38 },
  { "t": 42850, "v": 2.9 },
  { "t": 50050, "v": 3.5 },
  { "t": 57300, "v": 4.11 },
  { "t": 64800, "v": 4.73 },
  { "t": 72300, "v": 5.36 },
  { "t": 79800, "v": 5.98 },
  { "t": 87300, "v": 6.61 }
]
```

## Log replay

`new ReplayCursor(events).at(t)` folds the stream up to `t` into a snapshot: intensity, pace, phase, paused,
grip, last narration, last message, media and the index of the current record. The autopsy page drives it with
a scrubber, play at 4×, and previous/next event buttons. This is **log playback only**: it never re-runs the
engine.

## Ghost overlay

`ghostAt(record, currentActiveMs, windowMs = 10000)` aligns a recorded session to the live session's
**active** clock, so pauses in either session do not shift the alignment. It returns the recorded pace and
intensity at that moment plus markers within ±10 s. For this record at 30 s of active time:

```json
{
  "pace": 1,
  "intensity": 2.48,
  "markers": [
    { "offsetMs": -4950, "type": "event_started", "label": "half_pace" },
    { "offsetMs": 0, "type": "pause", "label": "pause" },
    { "offsetMs": 5350, "type": "check_shown", "label": "check_shown" }
  ]
}
```

On the session page, the ghost is shown read-only in the status panel. Nothing flows from the ghost into the
live runtime.

## Deterministic re-simulation, and its limits

`verifyReplay(record)` builds a new `SessionRuntime` with the embedded config, seed and tick size. It feeds the
recorded user actions (pauses, resumes, check answers, prompt submissions and skips, disables, ceiling changes,
media changes, termination) at their recorded wall times, then compares the engine-driven records (event
start/finish, pace, phase, check and prompt display, climax, end).

```json
{
  "attempted": true,
  "matches": true,
  "compared": 23,
  "divergences": [],
  "limitations": [
    "Media files are never embedded; images/videos may no longer be available, and their timing is replayed from the log only."
  ]
}
```

The same call on an export with the configuration redacted:

```json
{
  "attempted": false,
  "matches": false,
  "compared": 0,
  "divergences": [],
  "limitations": [
    "The configuration snapshot is not embedded (it may have been redacted on export).",
    "Media files are never embedded; images/videos may no longer be available, and their timing is replayed from the log only.",
    "Re-simulation needs the embedded configuration and seed."
  ]
}
```

When exact reconstruction is impossible, `reproducibility()` says so. It never claims a match. The cases are:

- the seed or the configuration snapshot is missing (for example, redacted on export);
- the engine or app version differs from the one that recorded the session;
- **media is never embedded**, so images may be gone and only their timing and ids are replayed;
- prompt text was not recorded, so validation is replayed as accepted;
- the record has engine errors, or the session was interrupted and never ended.

The UI only reports "matched" after the comparison has actually run and found zero divergences.

## Accounting on this record

```json
{
  "facts": {
    "totalChecks": 4,
    "positive": 3,
    "negative": 1,
    "neutral": 0,
    "skippedChecks": 0,
    "timedOutChecks": 0,
    "pauses": 1,
    "safetyPauses": 0,
    "promptsShown": 0,
    "promptsCompleted": 0,
    "promptsSkipped": 0,
    "promptCompletionRate": null,
    "instructionsFollowed": 3,
    "instructionsNotFollowed": 1,
    "eventsRun": 6,
    "excludedRecords": 0,
    "correctedRecords": 0
  },
  "totals": {
    "positive": 3,
    "negative": 1,
    "neutral": 0,
    "net": 2
  },
  "lines": [
    {
      "ruleId": "checks_negative",
      "counted": 1,
      "total": 1,
      "explanation": "1 record(s) of type check_answered where data.value == \"negative\" \u00d7 1 point(s) = 1"
    },
    {
      "ruleId": "checks_positive",
      "counted": 3,
      "total": 3,
      "explanation": "3 record(s) of type check_answered where data.value == \"positive\" \u00d7 1 point(s) = 3"
    },
    {
      "ruleId": "prompts_completed",
      "counted": 0,
      "total": 0,
      "explanation": "0 record(s) of type prompt_submitted where data.valid == true \u00d7 1 point(s) = 0"
    }
  ]
}
```

The pause is a fact (`pauses: 1`). It contributes to no tally, because the "Pauses" rule ships disabled. Counting
it is a separate rule the user has to turn on.

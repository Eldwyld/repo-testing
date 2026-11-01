/**
 * Forge mode: runs a SessionRuntime (src/forge) inside the original game
 * engine so the stroke meter, image slideshow, sound cues and toy
 * integration keep working. The classic dice/hypno/intensity modules are not
 * loaded in this mode; the runtime is the single source of truth for pace,
 * phase and intensity, and this bridge mirrors them into the engine frame.
 *
 * Pause is two-way: the engine's pause (Escape key, pause menu) pauses the
 * runtime, and runtime-level pauses/breaks keep the engine paused.
 */
import { definePlugin, pluginPaths } from '../../engine/plugins/Plugins';
import { Composer } from '../../engine/Composer';
import { ModuleManager } from '../../engine/modules/ModuleManager';
import { Module } from '../../engine/modules/Module';
import { typedPath } from '../../engine/Lens';
import { GameTiming } from '../../engine/State';
import Mode from './mode';
import Scene from './scene';
import Clock from './clock';
import Pace from './pace';
import Stroke from './stroke';
import RandomImages from './randomImages';
import Cues from './cues';
import Phase from './phase';
import Pause from './pause';
import Image from './image';
import { activeSession } from '../../forge/ui/activeSession';
import type { RuntimeView } from '../../forge/runtime/runtime';

const PLUGIN_ID = 'forge.mode';
const BRIDGE_ID = 'forge.bridge';
export const FORGE_MODE = 'forge';

export type ForgeFrame = {
  view: RuntimeView | null;
  lastMedia?: string;
  lastMediaRequests: number;
  /** Engine pause value seen on the previous tick (edge detection). */
  lastEnginePaused?: boolean;
  lastStatus?: RuntimeView['status'];
};

export const forgePaths = pluginPaths<ForgeFrame>(BRIDGE_ID);
const timing = typedPath<GameTiming>([]);
const intensityPath = typedPath<{ intensity: number }>(['core.intensity']);
const pacePath = typedPath<number>(['core.pace', 'pace']);
const phasePath = typedPath<string>(['core.phase', 'current']);
const pausedPath = typedPath<boolean>(['core.pause', 'paused']);

const Bridge: Module = {
  id: BRIDGE_ID,
  activate: Composer.set(forgePaths, { view: null, lastMediaRequests: 0 }),
  update: Composer.do(({ get, set, pipe }) => {
    const rt = activeSession.get();
    if (!rt) return;
    const enginePaused = !!get(pausedPath);
    const state = get(forgePaths) ?? { view: null, lastMediaRequests: 0 };

    // Do not start the session clock until the engine's start countdown is over.
    if (state.lastEnginePaused === undefined) {
      if (enginePaused) return;
      set(forgePaths.lastEnginePaused, false);
    } else if (enginePaused !== state.lastEnginePaused) {
      // Edge-triggered engine -> runtime sync (Escape key, pause menu, resume countdown).
      set(forgePaths.lastEnginePaused, enginePaused);
      if (enginePaused) rt.pause('user');
      else rt.resume();
    }

    rt.tick(get(timing.step));
    const view = rt.view;

    // Edge-triggered runtime -> engine sync (runtime pauses, scheduled breaks, end).
    if (view.status !== state.lastStatus) {
      set(forgePaths.lastStatus, view.status);
      if (view.status !== 'running' && !enginePaused) {
        set(forgePaths.lastEnginePaused, true);
        pipe(Pause.setPaused(true));
      }
      if (view.status === 'running' && state.lastStatus === 'break' && enginePaused) pipe(Pause.setPaused(false));
    }

    const image = get(Image.paths)?.currentImage;
    const mediaId = image ? `${image.service}:${image.id}` : undefined;
    if (mediaId !== state.lastMedia) {
      rt.setMedia(mediaId);
      set(forgePaths.lastMedia, mediaId);
    }
    if (view.mediaRequests !== state.lastMediaRequests) {
      set(forgePaths.lastMediaRequests, view.mediaRequests);
      const next = get(Image.paths)?.nextImages ?? [];
      if (next.length) pipe(Image.setCurrentImage(next[0]));
    }

    if (get(pacePath) !== view.pace) pipe(Pace.setPace(view.pace));
    const phase = view.status === 'break' ? 'break' : view.phase;
    if (get(phasePath) !== phase) pipe(Phase.setPhase(phase));
    set(intensityPath, { intensity: view.intensity / 10 });
    set(forgePaths.view, view);
  }),
  deactivate: Composer.set(forgePaths, undefined),
};

const run: Module[] = [Clock, Pace, Stroke, RandomImages, Cues, Bridge];

const start = Composer.pipe(...run.map(ModuleManager.load));
const stop = Composer.pipe(...run.map(m => ModuleManager.unload(m.id)), Composer.set(intensityPath, undefined));

const Forge = definePlugin({
  sdk: 'Forge',
  id: PLUGIN_ID,
  meta: {
    name: 'Forge',
    description: 'Configurable identity/narrative session engine',
  },
  ordering: {
    loadAfter: [Mode.id, Scene.id],
  },

  enter: () => Mode.setMode(FORGE_MODE),
  leave: () => Mode.setMode('classic'),

  activate: Composer.pipe(Mode.register({ id: FORGE_MODE, name: 'Forge' }), Mode.whenMode(FORGE_MODE, start)),

  update: Composer.pipe(
    Mode.onEnter(FORGE_MODE, () => start),
    Mode.onLeave(FORGE_MODE, () => stop)
  ),

  deactivate: Composer.pipe(Mode.unregister(FORGE_MODE), stop),

  get paths() {
    return forgePaths;
  },
});

declare module '../../engine/sdk' {
  interface PluginSDK {
    Forge: typeof Forge;
  }
}

export default Forge;

import { Composer } from '../../../engine/Composer';
import { typedPath } from '../../../engine/Lens';
import { Module } from '../../../engine/modules/Module';
import { Pipe } from '../../../engine/State';
import { Sequence } from '../../Sequence';
import Phase, { GamePhase } from '../phase';
import Rand from '../rand';
import { PLUGIN_ID, outcomeDone } from './types';

export enum Hands {
  left = 'left',
  right = 'right',
  both = 'both',
}

export const HandLabels: Record<Hands, string> = {
  left: 'Left',
  right: 'Right',
  both: 'Both',
};

export const handsPath = typedPath<Hands>([PLUGIN_ID, 'hands']);

const allHands = Object.values(Hands);

const seq = Sequence.for(PLUGIN_ID, 'randomGrip');

const regrip = (then: (hands: Hands) => Pipe): Pipe =>
  Composer.do(({ get, set, pipe, take }) => {
    const current = get(handsPath);
    const others = allHands.filter(p => p !== current);
    const next = take<Hands>(fn => Rand.pick(others, fn));
    set(handsPath, next);
    pipe(then(next));
  });

export const randomGripModule: Module = {
  id: `${PLUGIN_ID}.random_grip`,
  ordering: { loadAfter: [PLUGIN_ID] },
  activate: Rand.pick(allHands, hand => Composer.set(handsPath, hand)),
  deactivate: Composer.set(handsPath, undefined),
  update: Composer.pipe(
    Phase.onEnter(GamePhase.active, () => regrip(() => Composer.pipe())),
    seq.on(() =>
      regrip(newHands =>
        Composer.pipe(
          seq.message({
            title: `Grip changed to ${HandLabels[newHands]}!`,
            duration: 5000,
          }),
          seq.after(10000, 'done')
        )
      )
    ),
    seq.on('done', () => outcomeDone())
  ),
};

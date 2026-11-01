import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Fields, SettingsDescription, JoiToggleTile } from '../../common';
import {
  GameHypnoType,
  GameHypnoDescriptions,
  GameHypnoLabels,
} from '../../types';
import { useSetting } from '../SettingsProvider';
import {
  faVenus,
  faSeedling,
  faMars,
  faHandSparkles,
  faPowerOff,
} from '@fortawesome/free-solid-svg-icons';

export const HypnoSettings = () => {
  const [hypno, setHypno] = useSetting('hypno');

  return (
    <Fields label={'Hypno'} role='radiogroup'>
      <SettingsDescription>Choose a hypno text set</SettingsDescription>
      {Object.keys(GameHypnoType).map(key => {
        const current = GameHypnoType[key as keyof typeof GameHypnoType];
        return (
          <JoiToggleTile
            key={current}
            value={hypno === current}
            onChange={() => setHypno(current)}
            type={'radio'}
          >
            <h6 className='subtitle'>{GameHypnoLabels[current]}</h6>
            <p className='caption'>{GameHypnoDescriptions[current]}</p>
            <span slot='trailing'>
              {(() => {
                switch (current) {
                  case GameHypnoType.off:
                    return <FontAwesomeIcon icon={faPowerOff} />;
                  case GameHypnoType.joi:
                    return <FontAwesomeIcon icon={faHandSparkles} />;
                  case GameHypnoType.breeding:
                    return <FontAwesomeIcon icon={faSeedling} />;
                  case GameHypnoType.maledom:
                    return <FontAwesomeIcon icon={faMars} />;
                  case GameHypnoType.femdom:
                    return <FontAwesomeIcon icon={faVenus} />;
                }
              })()}
            </span>
          </JoiToggleTile>
        );
      })}
    </Fields>
  );
};

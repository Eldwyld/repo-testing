import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { HomePage } from '../home';
import { GamePage } from '../game';
import { EndPage } from '../end';
import { GameShell } from '../game/GameShell';
import { SceneBridge } from '../game/SceneBridge';
import { StudioPage } from '../forge/ui/StudioPage';
import { ForgeGamePage } from '../forge/ui/ForgeGamePage';
import { AutopsyPage } from '../forge/ui/AutopsyPage';

import '@awesome.me/webawesome/dist/styles/webawesome.css';

export const App = () => {
  return (
    <GameShell>
      <BrowserRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <SceneBridge />
        <Routes>
          <Route path='/' element={<HomePage />} />
          <Route path='/play' element={<GamePage />} />
          <Route path='/end' element={<EndPage />} />
          <Route path='/forge' element={<StudioPage />} />
          <Route path='/forge/play' element={<ForgeGamePage />} />
          <Route path='/forge/history/:id' element={<AutopsyPage />} />
        </Routes>
      </BrowserRouter>
    </GameShell>
  );
};

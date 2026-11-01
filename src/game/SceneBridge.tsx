import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useGameEngine } from './hooks/UseGameEngine';
import { useGameFrame } from './hooks';
import Scene from './plugins/scene';

const routeToScene: Record<string, string> = {
  '/': 'home',
  '/play': 'game',
  '/end': 'end',
  '/forge/play': 'game',
};

const sceneToRoute: Record<string, string> = {
  home: '/',
  game: '/play',
  end: '/end',
};

export const SceneBridge = () => {
  const { injectImpulse } = useGameEngine();
  const location = useLocation();
  const navigate = useNavigate();
  const sceneState = useGameFrame(Scene.paths) as
    | { current?: string }
    | undefined;

  const lastRouteSceneRef = useRef<string | null>(null);
  const prevSceneRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const scene = routeToScene[location.pathname] ?? 'unknown';
    lastRouteSceneRef.current = scene;
    injectImpulse(Scene.setScene(scene));
  }, [location.pathname, injectImpulse]);

  useEffect(() => {
    const current = sceneState?.current;
    // Only follow genuine scene changes. A route change re-renders this
    // effect (navigate's identity changes) while the frame still holds the
    // previous scene; without this guard that stale scene would redirect
    // straight back (e.g. leaving /forge/play bounced to /play).
    const changed = current !== prevSceneRef.current;
    prevSceneRef.current = current;
    if (!changed) return;
    if (!current || current === 'unknown') return;
    if (current === lastRouteSceneRef.current) return;

    const route = sceneToRoute[current];
    if (!route) return;

    lastRouteSceneRef.current = current;
    navigate(route);
  }, [navigate, sceneState]);

  return null;
};

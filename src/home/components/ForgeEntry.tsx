import styled from 'styled-components';
import { Link } from 'react-router-dom';
import { FORGE_BUILD } from '../../forge/buildInfo';
import { OFFLINE_BUILD } from '../../utils/offline';

/**
 * Entry point from the original home page into the Forge studio. The classic
 * app stays at "/", so without this the fork is easy to miss.
 */
const StyledForgeEntry = styled.section`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  margin: 16px 0 24px;
  text-align: center;

  & a {
    display: inline-block;
    font-size: 1.35rem;
    font-weight: 800;
    text-decoration: none;
    color: #2b1b3e;
    background: #f6a8c7;
    padding: 12px 26px;
    border: 2.5px solid #2b1b3e;
    border-radius: 999px 900px 999px 950px / 950px 999px 900px 999px;
    box-shadow:
      0 0 0 5px #fff9ef,
      6px 7px 0 5px #a9cdfb;
    transition: transform 0.12s ease;
  }

  & a:hover {
    transform: translate(-1px, -1px) rotate(-1.2deg);
  }

  & a:focus-visible {
    outline: 3px dashed #7a2bff;
    outline-offset: 8px;
  }

  @media (prefers-reduced-motion: reduce) {
    & a:hover {
      transform: none;
    }
  }

  & p {
    margin: 6px 0 0;
    font-size: 0.9rem;
    opacity: 0.8;
  }
`;

export const ForgeEntry = () => (
  <StyledForgeEntry aria-label='JOI Forge'>
    <Link to='/forge'>Open JOI Forge Studio →</Link>
    <p>
      Configurable identities, narration, events and session replay. The classic
      slideshow below is unchanged. Forge build {FORGE_BUILD}.
      {OFFLINE_BUILD &&
        ' Offline build: only images and videos from this device are used.'}
    </p>
  </StyledForgeEntry>
);

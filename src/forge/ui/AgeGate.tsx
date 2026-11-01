import { ReactNode } from 'react';
import { HomeProvider, useHomeValue } from '../../home/HomeProvider';
import { AgeWarning } from '../../home/components/AgeWarning';

/**
 * Forge pages reuse the original app's 18+ confirmation (same stored value),
 * so opening /forge directly cannot bypass it. Nothing below the gate —
 * including a session runtime — is mounted until the visitor confirms.
 */
function Gate({ children }: { children: ReactNode }) {
  const [confirmed] = useHomeValue('ageCheckConfirm');
  return confirmed ? <>{children}</> : <AgeWarning />;
}

export function AgeGate({ children }: { children: ReactNode }) {
  return (
    <HomeProvider>
      <Gate>{children}</Gate>
    </HomeProvider>
  );
}

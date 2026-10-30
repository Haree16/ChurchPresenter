import { useEffect, useMemo, useState } from 'react';
import { OperatorView } from './components/OperatorView';
import { AudienceView } from './components/AudienceView';
import { StageDisplayView } from './components/Stage/StageDisplayView';
import { LivestreamOverlayView } from './components/Overlay/LivestreamOverlayView';
import { AlphaKeyView } from './components/Broadcast/AlphaKeyView';
import { DatabaseRecoveryModal } from './components/DatabaseRecoveryModal';
import { api } from './services/api';
import { mediaService } from './services/mediaService';
import { DatabaseHealth } from './types';

export function App() {
  const [dbHealth, setDbHealth] = useState<DatabaseHealth | null>(null);

  useEffect(() => {
    api.getAppDataDir().then((dir) => {
      if (dir) {
        mediaService.setAppDataDir(dir);
      }
    }).catch(() => {});

    api.getDatabaseHealth().then((health) => {
      if (health && !health.isHealthy) {
        setDbHealth(health);
      }
    }).catch(() => {});
  }, []);

  const windowMode = useMemo(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const w = params.get('window');
      if (w === 'audience' || window.location.hash.includes('audience')) {
        return 'audience';
      }
      if (w === 'stage' || window.location.hash.includes('stage')) {
        return 'stage';
      }
      if (w === 'overlay' || window.location.hash.includes('overlay')) {
        return 'overlay';
      }
      if (w === 'alpha_fill' || window.location.hash.includes('alpha_fill')) {
        return 'alpha_fill';
      }
      if (w === 'alpha_key' || window.location.hash.includes('alpha_key')) {
        return 'alpha_key';
      }
      if (w === 'alpha_combined' || window.location.hash.includes('alpha_combined')) {
        return 'alpha_combined';
      }
    }
    return 'operator';
  }, []);

  if (windowMode === 'audience') {
    return <AudienceView />;
  }

  if (windowMode === 'stage') {
    return <StageDisplayView />;
  }

  if (windowMode === 'overlay') {
    return <LivestreamOverlayView />;
  }

  if (windowMode === 'alpha_fill') {
    return <AlphaKeyView role="fill" />;
  }

  if (windowMode === 'alpha_key') {
    return <AlphaKeyView role="key" />;
  }

  if (windowMode === 'alpha_combined') {
    return <AlphaKeyView role="combined" />;
  }

  return (
    <>
      {dbHealth && !dbHealth.isHealthy && (
        <DatabaseRecoveryModal
          health={dbHealth}
          onRecovered={() => setDbHealth(null)}
        />
      )}
      <OperatorView />
    </>
  );
}

export default App;

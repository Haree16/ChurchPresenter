import { useMemo } from 'react';
import { OperatorView } from './components/OperatorView';
import { AudienceView } from './components/AudienceView';
import { StageDisplayView } from './components/Stage/StageDisplayView';
import { LivestreamOverlayView } from './components/Overlay/LivestreamOverlayView';

export function App() {
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

  return <OperatorView />;
}

export default App;

// Powered by OnSpace.AI
import { useContext } from 'react';
import { CanvasContext } from '@/contexts/CanvasContext';

export function useCanvas() {
  const context = useContext(CanvasContext);
  if (!context) throw new Error('useCanvas must be used within CanvasProvider');
  return context;
}

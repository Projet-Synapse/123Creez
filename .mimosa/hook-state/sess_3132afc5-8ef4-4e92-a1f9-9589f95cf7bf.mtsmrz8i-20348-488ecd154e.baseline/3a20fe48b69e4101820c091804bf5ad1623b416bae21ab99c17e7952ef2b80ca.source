// Powered by OnSpace.AI
import { useContext } from 'react';
import { AutomationContext } from '@/contexts/AutomationContext';

export function useAutomation() {
  const ctx = useContext(AutomationContext);
  if (!ctx) throw new Error('useAutomation must be used within AutomationProvider');
  return ctx;
}

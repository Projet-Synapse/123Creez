// Powered by OnSpace.AI
import { useContext } from 'react';
import { VaultContext } from '@/contexts/VaultContext';

export function useVault() {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error('useVault must be used within VaultProvider');
  return ctx;
}

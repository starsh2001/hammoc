import { createContext, useContext, ReactNode } from 'react';
import type { CLIStatusResponse } from '@bmad-studio/shared';

interface CliStatusContextValue {
  cliStatus: CLIStatusResponse | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  isReady: boolean;
}

const CliStatusContext = createContext<CliStatusContextValue | null>(null);

interface CliStatusProviderProps {
  children: ReactNode;
  value: CliStatusContextValue;
}

export function CliStatusProvider({ children, value }: CliStatusProviderProps) {
  return (
    <CliStatusContext.Provider value={value}>
      {children}
    </CliStatusContext.Provider>
  );
}

export function useCliStatusContext(): CliStatusContextValue {
  const context = useContext(CliStatusContext);
  if (!context) {
    throw new Error(
      'useCliStatusContext must be used within a CliStatusProvider'
    );
  }
  return context;
}

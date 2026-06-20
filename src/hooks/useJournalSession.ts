import { useContext } from 'react';

import { JournalSessionContext } from '../context/JournalSessionContext';

export function useJournalSession() {
  const context = useContext(JournalSessionContext);
  if (!context) {
    throw new Error('useJournalSession must be used within JournalSessionProvider');
  }
  return context;
}

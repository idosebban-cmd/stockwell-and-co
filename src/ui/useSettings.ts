import { useCallback, useMemo, useState } from 'react';
import { getStorage, loadSettings, saveSettings, type Settings } from '../sim/save';

/** The player's settings, remembered between sessions. */
export function useSettings() {
  const storage = useMemo(() => getStorage(), []);
  const [settings, setSettingsState] = useState<Settings>(() => loadSettings(storage));
  const setSettings = useCallback(
    (s: Partial<Settings>) => {
      setSettingsState((prev) => {
        const next = { ...prev, ...s };
        saveSettings(storage, next);
        return next;
      });
    },
    [storage],
  );
  return { settings, setSettings };
}

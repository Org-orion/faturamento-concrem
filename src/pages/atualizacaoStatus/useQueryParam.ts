import { useLocation } from 'react-router-dom';
import { useMemo } from 'react';

export function useQueryParam(key: string): string | null {
  const { search } = useLocation();
  return useMemo(() => {
    const params = new URLSearchParams(search);
    const v = params.get(key);
    return v ? String(v) : null;
  }, [key, search]);
}


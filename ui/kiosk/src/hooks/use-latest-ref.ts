import { useEffect, useRef } from 'react';

/** Keep a ref synced to the latest value without updating during render. */
export function useLatestRef<T>(value: T) {
  const ref = useRef(value);

  useEffect(() => {
    ref.current = value;
  });

  return ref;
}

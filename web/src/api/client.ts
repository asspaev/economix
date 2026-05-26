type UnauthorizedHandler = () => void;

const handlers = new Set<UnauthorizedHandler>();

export function notifyUnauthorized(): void {
  for (const handler of Array.from(handlers)) {
    try {
      handler();
    } catch {
      /* noop — listener errors must not break callers */
    }
  }
}

export function onUnauthorized(handler: UnauthorizedHandler): () => void {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}

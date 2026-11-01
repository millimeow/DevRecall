/** Bind generated citation text to actual, contiguous source spans. Runtime validation remains mandatory. */
export function groundedSchema(
  schema: Record<string, unknown>,
  sources: { id: string; body: string }[],
): Record<string, unknown> {
  const excerpts = new Map<string, Set<string>>();
  for (const source of sources) {
    const choices = excerpts.get(source.id) ?? new Set<string>();
    for (const line of source.body.split(/[\r\n]+/)) {
      let start = 0;
      while (start < line.length) {
        let end = Math.min(start + 280, line.length);
        if (end < line.length) {
          const wordEnd = line.lastIndexOf(' ', end);
          if (wordEnd > start + 140) end = wordEnd;
        }
        const excerpt = line.slice(start, end).trim();
        if (excerpt) choices.add(excerpt);
        start = end;
      }
    }
    if (choices.size) excerpts.set(source.id, choices);
  }
  if (!excerpts.size) return schema;
  function bind(node: unknown): unknown {
    if (Array.isArray(node)) return node.map(bind);
    if (!node || typeof node !== 'object') return node;
    const object = node as Record<string, unknown>;
    const properties = object.properties as Record<string, Record<string, unknown>> | undefined;
    if (properties?.source_id && properties.excerpt) {
      return {
        anyOf: [...excerpts].map(([id, choices]) => ({
          ...object,
          properties: {
            ...properties,
            source_id: { ...properties.source_id, enum: [id] },
            excerpt: { ...properties.excerpt, enum: [...choices] },
          },
        })),
      };
    }
    return Object.fromEntries(Object.entries(object).map(([key, value]) => [key, bind(value)]));
  }
  return bind(schema) as Record<string, unknown>;
}

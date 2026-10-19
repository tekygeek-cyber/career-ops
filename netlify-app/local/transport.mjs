// Applies before upstream ctx.fetch: cap error bodies, abort body stalls,
// and reject all redirects (upstream's wrapper otherwise follows them).
export function boundedFetch(fetchImpl = globalThis.fetch) {
  return async (url, options = {}) => {
    const signal = AbortSignal.any([
      ...(options.signal ? [options.signal] : []),
      AbortSignal.timeout(30000),
    ]);
    const response = await fetchImpl(url, {
      ...options,
      redirect: "error",
      signal,
    });
    let size = 0;
    const stream = response.body?.pipeThrough(
      new TransformStream({
        transform(chunk, controller) {
          size += chunk.byteLength;
          if (size > 2e6) throw new Error("Response exceeds limit.");
          controller.enqueue(chunk);
        },
      }),
    );
    return new Response(stream, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  };
}

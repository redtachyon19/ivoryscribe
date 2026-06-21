// React 19.2 ships a dev-only "component performance track": on each commit it
// serialises the changed prop diff into `performance.measure(name, { detail })`,
// and the browser structured-clones that detail. Some of this app's props are
// large — a Project carries every chapter's HTML in `contentById` plus a growing
// `versions` array of full-document snapshots — so the clone can exceed the
// structured-clone size limit and throw:
//
//   DataCloneError: Failed to execute 'measure' on 'Performance':
//                   Data cannot be cloned, out of memory.
//
// React doesn't catch it, so it surfaces as an uncaught error mid-render and can
// take down the dev session. The track only runs in development (production
// React never calls measure with these details), so we wrap performance.measure
// to swallow exactly that clone failure and re-throw everything else. No-op in
// production builds (gated on import.meta.env.DEV).

if (import.meta.env.DEV && typeof performance !== "undefined" && typeof performance.measure === "function") {
  const originalMeasure = performance.measure.bind(performance)
  performance.measure = function patchedMeasure(
    ...args: Parameters<Performance["measure"]>
  ): PerformanceMeasure {
    try {
      return originalMeasure(...args)
    } catch (error) {
      // Only ignore React's perf-track detail that's too big/circular to clone;
      // any other measure failure is a real bug and must still surface.
      if (error instanceof DOMException && error.name === "DataCloneError") {
        // React discards this return value (it calls measure for the side effect).
        return undefined as unknown as PerformanceMeasure
      }
      throw error
    }
  }
}

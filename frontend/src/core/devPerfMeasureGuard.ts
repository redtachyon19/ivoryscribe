if (import.meta.env.DEV && typeof performance !== "undefined" && typeof performance.measure === "function") {
  const originalMeasure = performance.measure.bind(performance)
  performance.measure = function patchedMeasure(
    ...args: Parameters<Performance["measure"]>
  ): PerformanceMeasure {
    try {
      return originalMeasure(...args)
    } catch (error) {
      if (error instanceof DOMException && error.name === "DataCloneError") {
        return undefined as unknown as PerformanceMeasure
      }
      throw error
    }
  }
}

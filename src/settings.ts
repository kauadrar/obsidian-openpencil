export interface OpenPencilSettings {
  snapToGeometry: boolean
  snapToObjects: boolean
  snapToPixelGrid: boolean
  zoomSpeed: number
}

export const DEFAULT_SETTINGS: OpenPencilSettings = {
  snapToGeometry: true,
  snapToObjects: true,
  snapToPixelGrid: true,
  zoomSpeed: 1,
}

export function sanitizeSettings(raw: unknown): OpenPencilSettings {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const zoom =
    typeof obj.zoomSpeed === 'number' && Number.isFinite(obj.zoomSpeed)
      ? Math.min(3, Math.max(0.25, obj.zoomSpeed))
      : DEFAULT_SETTINGS.zoomSpeed
  return {
    snapToGeometry: typeof obj.snapToGeometry === 'boolean' ? obj.snapToGeometry : DEFAULT_SETTINGS.snapToGeometry,
    snapToObjects: typeof obj.snapToObjects === 'boolean' ? obj.snapToObjects : DEFAULT_SETTINGS.snapToObjects,
    snapToPixelGrid: typeof obj.snapToPixelGrid === 'boolean' ? obj.snapToPixelGrid : DEFAULT_SETTINGS.snapToPixelGrid,
    zoomSpeed: zoom,
  }
}

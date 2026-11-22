// Small stroke icons for the shell, drawn on a 16×16 grid. Each is the inner markup of an <svg>.
import type { Tool } from '@open-pencil/core'

export const TOOL_ICONS: Partial<Record<Tool, string>> = {
  SELECT: '<path d="M3.5 2.5l9 4-3.8 1.3-1.3 3.8z"/>',
  SCALE: '<path d="M3 13L13 3M8 3h5v5M3 8v5h5"/>',
  FRAME: '<path d="M5.5 2v12M10.5 2v12M2 5.5h12M2 10.5h12"/>',
  SECTION: '<rect x="2.5" y="4.5" width="11" height="9" rx="1"/><path d="M2.5 2.5h5"/>',
  RECTANGLE: '<rect x="3" y="3" width="10" height="10" rx="1"/>',
  ELLIPSE: '<circle cx="8" cy="8" r="5"/>',
  LINE: '<path d="M3 13L13 3"/>',
  POLYGON: '<path d="M8 2.5l5.5 10h-11z"/>',
  STAR: '<path d="M8 2.2l1.7 3.6 3.9.4-2.9 2.7.8 3.9L8 10.8l-3.5 2 .8-3.9-2.9-2.7 3.9-.4z"/>',
  PEN: '<path d="M8 2l4.5 6-4.5 6-4.5-6zM8 8v.01M8 2v4"/>',
  PENCIL: '<path d="M11 2.5l2.5 2.5-8 8H3v-2.5z"/>',
  TEXT: '<path d="M3 3.5h10M8 3.5v9.5M6 13h4"/>',
  HAND: '<path d="M5 8V4a1 1 0 012 0v3.5V3a1 1 0 012 0v4.5V4a1 1 0 012 0v5.5c0 2.5-1.7 4-4 4-1.6 0-2.6-.8-3.4-2L2.5 8.6a1 1 0 011.6-1.2z"/>',
  COMMENT: '<path d="M8 2.5a5.5 5.5 0 015.5 5.5A5.5 5.5 0 018 13.5H2.5V8A5.5 5.5 0 018 2.5z"/>',
  STICKY: '<path d="M3 3h10v6l-4 4H3z M9 13V9h4"/>',
  SHAPE_WITH_TEXT: '<rect x="2.5" y="3.5" width="11" height="9" rx="2"/><path d="M6 7h4M8 7v3"/>',
  CONNECTOR: '<path d="M3 13c5 0 3-10 10-10M10.5 3H13v2.5"/>',
}

export const LAYER_ICONS: Record<string, string> = {
  FRAME: TOOL_ICONS.FRAME!,
  SECTION: TOOL_ICONS.SECTION!,
  GROUP: '<rect x="2.5" y="2.5" width="11" height="11" rx="1" stroke-dasharray="2 1.5"/>',
  COMPONENT: '<path d="M8 2l2.5 2.5L8 7 5.5 4.5zM8 9l2.5 2.5L8 14l-2.5-2.5zM4.5 5.5L7 8l-2.5 2.5L2 8zM11.5 5.5L14 8l-2.5 2.5L9 8z"/>',
  COMPONENT_SET: '<path d="M8 2l2.5 2.5L8 7 5.5 4.5zM8 9l2.5 2.5L8 14l-2.5-2.5zM4.5 5.5L7 8l-2.5 2.5L2 8zM11.5 5.5L14 8l-2.5 2.5L9 8z"/>',
  INSTANCE: '<path d="M8 2l6 6-6 6-6-6z"/>',
  RECTANGLE: TOOL_ICONS.RECTANGLE!,
  ROUNDED_RECTANGLE: TOOL_ICONS.RECTANGLE!,
  ELLIPSE: TOOL_ICONS.ELLIPSE!,
  LINE: TOOL_ICONS.LINE!,
  POLYGON: TOOL_ICONS.POLYGON!,
  STAR: TOOL_ICONS.STAR!,
  TEXT: TOOL_ICONS.TEXT!,
  VECTOR: TOOL_ICONS.PEN!,
  BOOLEAN_OPERATION: '<rect x="2.5" y="2.5" width="7" height="7"/><rect x="6.5" y="6.5" width="7" height="7"/>',
  STICKY: TOOL_ICONS.STICKY!,
  SHAPE_WITH_TEXT: TOOL_ICONS.SHAPE_WITH_TEXT!,
  CONNECTOR: TOOL_ICONS.CONNECTOR!,
  IMAGE: '<rect x="2.5" y="3" width="11" height="10" rx="1"/><path d="M2.5 11l3.5-3.5 3 3 2-2 2.5 2.5"/>',
}

export const PAGE_ICON = '<path d="M4 2h5.5L12 4.5V14H4zM9.5 2v2.5H12"/>'
export const EYE_ICON = '<path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/>'
export const EYE_OFF_ICON = '<path d="M2 2l12 12M6.5 4A6.6 6.6 0 0114.5 8a10 10 0 01-1.8 2.3M10.2 11.9A6.6 6.6 0 011.5 8a10 10 0 012.4-2.9"/>'
export const LOCK_ICON = '<rect x="3.5" y="7" width="9" height="6.5" rx="1"/><path d="M5.5 7V5a2.5 2.5 0 015 0v2"/>'
export const CHEVRON_ICON = '<path d="M6 4l4 4-4 4"/>'
export const CHEVRON_DOWN_ICON = '<path d="M5 6.5l3 3 3-3"/>'

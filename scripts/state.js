export const state = {
  xmlDoc: null,
  fields: [],
  selectedIndex: -1,

  // preview state
  zoom: 0.25,
  panX: 40,
  panY: 40,
  draggingCanvas: false,
  draggingField: false,
  hoverIndex: -1,
  dragStart: { sx:0, sy:0, panX:0, panY:0, wx:0, wy:0, fx:0, fy:0 },
};
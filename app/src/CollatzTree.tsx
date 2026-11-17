import { memo, useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react';
import { hierarchy, tree } from 'd3-hierarchy';
import { select } from 'd3-selection';
import 'd3-transition';
import {
  zoom,
  zoomIdentity,
  type D3ZoomEvent,
  type ZoomBehavior,
  type ZoomTransform,
} from 'd3-zoom';

const TWO_PI = Math.PI * 2;

export interface CollatzTreeRef {
  buildTree: (seed: number, onComplete: () => void) => void;
  followPathDown: (seed: number) => void;
  setExploreMode: (explore: boolean) => void;
  focusOnNode: (id: number) => void;
  recalculateLayout: () => void;
  stopBuilding: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetView: () => void;
  exportImage: () => string | null;
}

interface Node {
  id: number;
  idStr: string;
  x: number;
  y: number;
  angle: number;
  parent: number | null;
  depth: number;
  isMainPath: boolean;
  targetX: number;
  targetY: number;
  layoutX?: number;
  layoutY?: number;
  weight: number;
  radius: number;
  hoveredRadius: number;
  edgeWidth: number;
  depthAlpha: number;
  nodeColor: string;
  sideEdgeColor: string;
}

interface Edge {
  source: Node;
  target: Node;
  isMain: boolean;
  cx: number;
  cy: number;
  cxValid: boolean;
}

interface Star {
  x: number;
  y: number;
  size: number;
  darkColor: string;
  lightColor: string;
}

export type ColorScheme =
  | 'prism'
  | 'crimson'
  | 'ember'
  | 'solar'
  | 'forest'
  | 'ocean'
  | 'indigo'
  | 'orchid'
  | 'aurora'
  | 'sunset'
  | 'cyber'
  | 'monochrome';

interface SchemeTheme {
  pulseFill: string;
  pulseShadow: string;
  activePath: string;
  mainNodeColor: string;
  mainEdgeHex: string;
  mainEdgeRgba: string;
  mainEdgeAlpha: number;
  svgBg: string;
  nodeFill: string;
  sideTextColor: string;
  sideTextCanvasColor: string;
  mainTextColor: string;
  getSideNodeColor: (depth: number, id: number) => string;
}

interface HueBandConfig {
  hueStart: number;
  hueSpan: number;
  hueStep: number;
  oddOffset: number;
  satDark: number;
  satLight: number;
  lumDarkBase?: number;
  lumDarkSpan?: number;
  lumLightBase?: number;
  lumLightSpan?: number;
  pulseShadowDark: string;
  pulseShadowLight: string;
  activePathDark: string;
  activePathLight: string;
  mainEdgeDark: string;
  mainEdgeLight: string;
  pulseFillDark?: string;
  pulseFillLight?: string;
}

const SCHEME_CONFIGS: Record<Exclude<ColorScheme, 'cyber'>, HueBandConfig> = {
  prism: {
    hueStart: 0, hueSpan: 360, hueStep: 15, oddOffset: 35,
    satDark: 100, satLight: 95,
    lumDarkBase: 60, lumDarkSpan: 25, lumLightBase: 50, lumLightSpan: 20,
    pulseFillDark: '#ffffff', pulseFillLight: '#0064c8',
    pulseShadowDark: '#00ffaa', pulseShadowLight: '#00b8ff',
    activePathDark: 'rgba(0, 255, 170, 0.7)', activePathLight: 'rgba(0, 100, 200, 0.7)',
    mainEdgeDark: '#00f0ff', mainEdgeLight: '#0050dc',
  },
  crimson: {
    hueStart: 345, hueSpan: 27, hueStep: 5, oddOffset: 9,
    satDark: 92, satLight: 84,
    pulseShadowDark: '#fb7185', pulseShadowLight: '#e11d48',
    activePathDark: 'rgba(255, 77, 109, 0.75)', activePathLight: 'rgba(185, 28, 28, 0.75)',
    mainEdgeDark: '#ff4d6d', mainEdgeLight: '#b91c1c',
  },
  ember: {
    hueStart: 14, hueSpan: 26, hueStep: 5, oddOffset: 8,
    satDark: 95, satLight: 88,
    pulseShadowDark: '#fdba74', pulseShadowLight: '#ea580c',
    activePathDark: 'rgba(251, 146, 60, 0.78)', activePathLight: 'rgba(194, 65, 12, 0.75)',
    mainEdgeDark: '#fb923c', mainEdgeLight: '#c2410c',
  },
  solar: {
    hueStart: 42, hueSpan: 20, hueStep: 4, oddOffset: 7,
    satDark: 94, satLight: 86,
    lumDarkBase: 56, lumDarkSpan: 22, lumLightBase: 44, lumLightSpan: 14,
    pulseShadowDark: '#fef08a', pulseShadowLight: '#ca8a04',
    activePathDark: 'rgba(253, 224, 71, 0.78)', activePathLight: 'rgba(161, 98, 7, 0.78)',
    mainEdgeDark: '#fde047', mainEdgeLight: '#a16207',
  },
  forest: {
    hueStart: 125, hueSpan: 35, hueStep: 7, oddOffset: 12,
    satDark: 84, satLight: 76,
    pulseShadowDark: '#86efac', pulseShadowLight: '#16a34a',
    activePathDark: 'rgba(74, 222, 128, 0.75)', activePathLight: 'rgba(21, 128, 61, 0.75)',
    mainEdgeDark: '#4ade80', mainEdgeLight: '#15803d',
  },
  ocean: {
    hueStart: 188, hueSpan: 40, hueStep: 8, oddOffset: 14,
    satDark: 92, satLight: 85,
    pulseShadowDark: '#67e8f9', pulseShadowLight: '#0284c7',
    activePathDark: 'rgba(56, 189, 248, 0.75)', activePathLight: 'rgba(3, 105, 161, 0.75)',
    mainEdgeDark: '#38bdf8', mainEdgeLight: '#0369a1',
  },
  indigo: {
    hueStart: 235, hueSpan: 33, hueStep: 6, oddOffset: 11,
    satDark: 88, satLight: 80,
    pulseShadowDark: '#a5b4fc', pulseShadowLight: '#4f46e5',
    activePathDark: 'rgba(129, 140, 248, 0.78)', activePathLight: 'rgba(55, 48, 163, 0.78)',
    mainEdgeDark: '#818cf8', mainEdgeLight: '#3730a3',
  },
  orchid: {
    hueStart: 278, hueSpan: 46, hueStep: 9, oddOffset: 16,
    satDark: 90, satLight: 82,
    pulseShadowDark: '#f0abfc', pulseShadowLight: '#a21caf',
    activePathDark: 'rgba(232, 121, 249, 0.75)', activePathLight: 'rgba(134, 25, 143, 0.75)',
    mainEdgeDark: '#e879f9', mainEdgeLight: '#86198f',
  },
  aurora: {
    hueStart: 145, hueSpan: 140, hueStep: 14, oddOffset: 28,
    satDark: 90, satLight: 82,
    pulseShadowDark: '#a855f7', pulseShadowLight: '#7c3aed',
    activePathDark: 'rgba(94, 255, 200, 0.75)', activePathLight: 'rgba(0, 135, 90, 0.75)',
    mainEdgeDark: '#5effc8', mainEdgeLight: '#00875a',
  },
  sunset: {
    hueStart: 320, hueSpan: 85, hueStep: 12, oddOffset: 22,
    satDark: 95, satLight: 88,
    pulseShadowDark: '#ff4d8d', pulseShadowLight: '#db2777',
    activePathDark: 'rgba(255, 184, 77, 0.78)', activePathLight: 'rgba(194, 65, 12, 0.75)',
    mainEdgeDark: '#ffb84d', mainEdgeLight: '#c2410c',
  },
  monochrome: {
    hueStart: 215, hueSpan: 1, hueStep: 0, oddOffset: 0,
    satDark: 8, satLight: 8,
    lumDarkBase: 48, lumDarkSpan: 34, lumLightBase: 55, lumLightSpan: 30,
    pulseShadowDark: '#cbd5e1', pulseShadowLight: '#475569',
    activePathDark: 'rgba(248, 250, 252, 0.75)', activePathLight: 'rgba(15, 23, 42, 0.75)',
    mainEdgeDark: '#f8fafc', mainEdgeLight: '#0f172a',
  },
};

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getSchemeTheme(scheme: ColorScheme, palette: 'dark' | 'light'): SchemeTheme {
  const isDark = palette === 'dark';
  const mainEdgeAlpha = isDark ? 0.95 : 0.85;
  const base = {
    mainNodeColor: isDark ? '#ffffff' : '#000000',
    mainEdgeAlpha,
    svgBg: isDark ? '#020610' : '#ffffff',
    nodeFill: isDark ? '#040812' : '#ffffff',
    sideTextColor: isDark ? 'rgba(255,255,255,0.78)' : 'rgba(0,0,0,0.78)',
    sideTextCanvasColor: isDark ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.75)',
    mainTextColor: isDark ? '#ffffff' : '#000000',
  };

  const formatHsl = (h: number, s: number, l: number) => `hsl(${Math.round(h)}, ${s}%, ${l.toFixed(1)}%)`;

  if (scheme === 'cyber') {
    const mainEdgeHex = isDark ? '#00f5d4' : '#0f766e';
    return {
      ...base,
      pulseFill: isDark ? '#ffffff' : '#0f172a',
      pulseShadow: isDark ? '#ff2a85' : '#be185d',
      activePath: isDark ? 'rgba(0, 245, 212, 0.78)' : 'rgba(15, 118, 110, 0.78)',
      mainEdgeHex,
      mainEdgeRgba: hexToRgba(mainEdgeHex, mainEdgeAlpha),
      getSideNodeColor: (depth, id) => {
        const depthRatio = Math.min(1, Math.max(0, 1 - depth / 120));
        const hue = id % 2 === 0 ? 182 + (depth % 18) : 322 + (depth % 18);
        return formatHsl(hue, isDark ? 96 : 86, isDark ? 56 + 22 * depthRatio : 46 - 16 * depthRatio);
      },
    };
  }

  const cfg = SCHEME_CONFIGS[scheme] ?? SCHEME_CONFIGS.prism;
  const lumDarkBase = cfg.lumDarkBase ?? 55;
  const lumDarkSpan = cfg.lumDarkSpan ?? 24;
  const lumLightBase = cfg.lumLightBase ?? 46;
  const lumLightSpan = cfg.lumLightSpan ?? 18;
  const mainEdgeHex = isDark ? cfg.mainEdgeDark : cfg.mainEdgeLight;

  return {
    ...base,
    pulseFill: isDark ? (cfg.pulseFillDark ?? '#ffffff') : (cfg.pulseFillLight ?? '#0f172a'),
    pulseShadow: isDark ? cfg.pulseShadowDark : cfg.pulseShadowLight,
    activePath: isDark ? cfg.activePathDark : cfg.activePathLight,
    mainEdgeHex,
    mainEdgeRgba: hexToRgba(mainEdgeHex, mainEdgeAlpha),
    getSideNodeColor: (depth, id) => {
      const depthRatio = Math.min(1, Math.max(0, 1 - depth / 120));
      const offset = (depth * cfg.hueStep + (id % 2 === 0 ? 0 : cfg.oddOffset)) % cfg.hueSpan;
      const hue = (cfg.hueStart + offset) % 360;
      const sat = isDark ? cfg.satDark : cfg.satLight;
      const lum = isDark ? lumDarkBase + lumDarkSpan * depthRatio : lumLightBase - lumLightSpan * depthRatio;
      return formatHsl(hue, sat, lum);
    },
  };
}

function computeNodeMetrics(node: Node): void {
  const baseR = 5.0 + Math.log10(node.id) * 3.5 + Math.log10(node.weight || 1) * 2.0;
  const radius = node.isMainPath ? baseR * 1.3 : baseR;
  node.radius = radius;
  node.hoveredRadius = radius * 1.4;
  const w = 0.5 + Math.log10(node.weight || 1) * 1.5;
  node.edgeWidth = node.isMainPath ? w * 2.5 : w;
  node.depthAlpha = Math.max(0.65, 1 - node.depth / 100);
}

function applyThemeToNode(node: Node, theme: SchemeTheme): void {
  if (node.isMainPath) {
    node.nodeColor = theme.mainNodeColor;
    node.sideEdgeColor = theme.mainEdgeRgba;
  } else {
    const c = theme.getSideNodeColor(node.depth, node.id);
    node.nodeColor = c;
    node.sideEdgeColor = c.replace(')', ', 0.55)').replace('hsl', 'hsla');
  }
}

function computeControlPoint(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  sourceId: number,
  targetId: number
): { cx: number; cy: number } {
  const mx = (x1 + x2) * 0.5;
  const my = (y1 + y2) * 0.5;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const isEvenStep = targetId === sourceId * 2;
  const severity = isEvenStep ? 0.02 : 0.12;
  const factor = severity * (targetId % 2 === 0 ? 1 : -1);
  return {
    cx: mx - dy * factor,
    cy: my + dx * factor,
  };
}

interface CollatzTreeProps {
  speed: number;
  isPaused: boolean;
  palette: 'dark' | 'light';
  colorScheme: ColorScheme;
  edgeStyle: 'curved' | 'straight';
  density: 'low' | 'medium' | 'high';
  hoveredNodeId: number | null | undefined;
  onHoverNode: (id: number | null) => void;
  onSelectNode: (id: number) => void;
  onRequestSeed?: (id: number) => void;
  onPathComplete?: () => void;
}

const CollatzTree = forwardRef<CollatzTreeRef, CollatzTreeProps>((props, ref) => {
  const propsRef = useRef(props);
  propsRef.current = props;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const a11yContainerRef = useRef<HTMLDivElement>(null);

  const nodesMap = useRef<Map<number, Node>>(new Map());
  const edges = useRef<Edge[]>([]);
  const themeRef = useRef<SchemeTheme>(getSchemeTheme(props.colorScheme, props.palette));

  const transformRef = useRef(zoomIdentity);
  const cameraTargetRef = useRef<{ x: number; y: number; k: number } | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const zoomBehaviorRef = useRef<ZoomBehavior<HTMLCanvasElement, unknown> | null>(null);

  const activeTaskRef = useRef<{ rafId?: number; isRunning: boolean }>({ isRunning: false });
  const activePathRef = useRef<{ nodes: Node[]; progress: number } | null>(null);
  const isExploreModeRef = useRef(false);
  const userZoomedDuringFollowRef = useRef(false);
  const isLayoutSettledRef = useRef(true);
  const [isAnimating, setIsAnimating] = useState(false);
  const lastTimeRef = useRef<number>(0);

  // Hover & hold states
  const [hoveredNode, setHoveredNode] = useState<Node | null>(null);
  const [holdingNodeId, setHoldingNodeId] = useState<number | null>(null);
  const hoveredPathSetRef = useRef<Set<number>>(new Set());

  // Particles & background stars
  const particlesRef = useRef<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    alpha: number;
    size: number;
    color: string;
  }[]>([]);

  const starsRef = useRef<Star[]>([]);
  if (starsRef.current.length === 0) {
    const list: Star[] = new Array(250);
    for (let i = 0; i < 250; i++) {
      const opacity = Math.random() * 0.5 + 0.2;
      list[i] = {
        x: (Math.random() - 0.5) * 6000,
        y: (Math.random() - 0.5) * 6000,
        size: Math.random() * 1.5 + 0.5,
        darkColor: `rgba(255, 255, 255, ${opacity})`,
        lightColor: `rgba(0, 0, 0, ${opacity * 0.3})`,
      };
    }
    starsRef.current = list;
  }

  const drawRef = useRef<(time: number) => void>(() => {});
  const scheduleDraw = useCallback(() => {
    if (rafIdRef.current === null) {
      lastTimeRef.current = 0;
      rafIdRef.current = requestAnimationFrame((t) => drawRef.current(t));
    }
  }, []);

  // Recompute cached theme & node colors when colorScheme or palette changes
  useEffect(() => {
    const theme = getSchemeTheme(props.colorScheme, props.palette);
    themeRef.current = theme;
    for (const node of nodesMap.current.values()) {
      applyThemeToNode(node, theme);
    }
    scheduleDraw();
  }, [props.colorScheme, props.palette, scheduleDraw]);

  useEffect(() => {
    scheduleDraw();
  }, [props.edgeStyle, props.isPaused, props.speed, scheduleDraw]);

  // Sync hoveredPathSetRef when hoveredNode changes
  const onHoverNodeProp = props.onHoverNode;
  useEffect(() => {
    const set = new Set<number>();
    if (hoveredNode) {
      let curr: Node | null = hoveredNode;
      while (curr) {
        set.add(curr.id);
        const parentId: number | null = curr.parent;
        curr = parentId !== null ? nodesMap.current.get(parentId) || null : null;
      }
    }
    hoveredPathSetRef.current = set;
    onHoverNodeProp(hoveredNode ? hoveredNode.id : null);
    scheduleDraw();
  }, [hoveredNode, onHoverNodeProp, scheduleDraw]);

  // Sync external hover state
  const externalHoveredNodeId = props.hoveredNodeId;
  useEffect(() => {
    if (externalHoveredNodeId !== undefined) {
      const node = externalHoveredNodeId ? nodesMap.current.get(externalHoveredNodeId) || null : null;
      setHoveredNode(prev => (prev?.id !== node?.id ? node : prev));
    }
  }, [externalHoveredNodeId]);

  // Perfect mathematical tree layout using d3.tree
  const computePalmLayout = (nodes: Map<number, Node>) => {
    const rootNode = nodes.get(1);
    if (!rootNode) return;

    const childrenOf = new Map<number, Node[]>();
    for (const node of nodes.values()) {
      if (node.parent !== null) {
        let list = childrenOf.get(node.parent);
        if (!list) {
          list = [];
          childrenOf.set(node.parent, list);
        }
        list.push(node);
      }
    }

    const root = hierarchy<Node>(rootNode, (n) => childrenOf.get(n.id));
    const dx = propsRef.current.density === 'high' ? 45 : 70;
    const dy = propsRef.current.density === 'high' ? 75 : 110;

    tree<Node>().nodeSize([dx, dy])(root);

    root.each((d) => {
      const n = d.data;
      const lx = d.x ?? 0;
      const ly = -(d.y ?? 0); // Invert Y to grow upwards
      n.layoutX = lx;
      n.layoutY = ly;
      n.targetX = lx;
      n.targetY = ly;
      n.angle = -Math.PI / 2;
    });
  };

  const recalculateLayout = () => {
    const nodes = nodesMap.current;
    if (nodes.size === 0) return;

    computePalmLayout(nodes);
    isLayoutSettledRef.current = false;
    for (const edge of edges.current) {
      edge.cxValid = false;
    }
    scheduleDraw();
  };

  // Recalculate when density prop changes
  useEffect(() => {
    recalculateLayout();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.density]);

  const initSingleNode = () => {
    nodesMap.current.clear();
    edges.current = [];
    activePathRef.current = null;
    cameraTargetRef.current = null;
    userZoomedDuringFollowRef.current = false;
    isLayoutSettledRef.current = true;

    const rootNode: Node = {
      id: 1,
      idStr: '1',
      x: 0,
      y: 0,
      angle: -Math.PI / 2,
      parent: null,
      depth: 0,
      isMainPath: true,
      targetX: 0,
      targetY: 0,
      layoutX: 0,
      layoutY: 0,
      weight: 1,
      radius: 0,
      hoveredRadius: 0,
      edgeWidth: 0,
      depthAlpha: 1,
      nodeColor: '',
      sideEdgeColor: '',
    };
    computeNodeMetrics(rootNode);
    applyThemeToNode(rootNode, themeRef.current);
    nodesMap.current.set(1, rootNode);

    if (a11yContainerRef.current) {
      a11yContainerRef.current.innerHTML = '';
      const btn = document.createElement('button');
      btn.className = 'sr-only';
      btn.dataset.nodeId = '1';
      btn.textContent = 'Node 1, the end of the sequence. Press enter to use as seed.';
      a11yContainerRef.current.appendChild(btn);
    }
  };

  const addNode = (
    val: number,
    parent: Node,
    isMainPath: boolean,
    a11yFragment?: DocumentFragment
  ): Node => {
    const jitterX = (Math.random() - 0.5) * 8.0;
    const jitterY = (Math.random() - 0.5) * 8.0;
    const node: Node = {
      id: val,
      idStr: val.toString(),
      x: parent.x + jitterX,
      y: parent.y + jitterY,
      angle: parent.angle,
      parent: parent.id,
      depth: parent.depth + 1,
      isMainPath,
      targetX: parent.x + jitterX,
      targetY: parent.y + jitterY,
      layoutX: parent.layoutX || 0,
      layoutY: parent.layoutY || 0,
      weight: 1,
      radius: 0,
      hoveredRadius: 0,
      edgeWidth: 0,
      depthAlpha: Math.max(0.65, 1 - (parent.depth + 1) / 100),
      nodeColor: '',
      sideEdgeColor: '',
    };

    nodesMap.current.set(val, node);
    edges.current.push({
      source: parent,
      target: node,
      isMain: isMainPath,
      cx: 0,
      cy: 0,
      cxValid: false,
    });

    const targetContainer = a11yFragment ?? a11yContainerRef.current;
    if (targetContainer && nodesMap.current.size <= 2000) {
      const btn = document.createElement('button');
      btn.className = 'sr-only';
      btn.dataset.nodeId = node.idStr;
      btn.textContent = `Node ${val}, ${val % 2 === 0 ? 'even' : 'odd'}, ${node.depth} steps to one. Press enter to use as seed.`;
      targetContainer.appendChild(btn);
    }

    return node;
  };

  drawRef.current = (time: number) => {
    rafIdRef.current = null;
    const rawDt = lastTimeRef.current ? time - lastTimeRef.current : 16.6;
    const dt = rawDt > 100 ? 16.6 : rawDt;
    lastTimeRef.current = time;
    const dtScale = dt / 16.6;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = ctxRef.current ?? canvas.getContext('2d');
    if (!ctx) return;
    ctxRef.current = ctx;

    const width = canvas.width;
    const height = canvas.height;
    let needsNextFrame = false;

    // Camera follow logic
    if (cameraTargetRef.current && !isExploreModeRef.current) {
      const target = cameraTargetRef.current;
      const t = transformRef.current;
      const ease = activePathRef.current ? 0.045 : 0.08;
      const dx = target.x - t.x;
      const dy = target.y - t.y;
      const keepZoom = Boolean(userZoomedDuringFollowRef.current && activePathRef.current);
      const dk = keepZoom ? 0 : target.k - t.k;

      if (Math.abs(dx) > 0.05 || Math.abs(dy) > 0.05 || Math.abs(dk) > 0.0005) {
        const newX = t.x + dx * ease;
        const newY = t.y + dy * ease;
        const newK = keepZoom ? t.k : t.k + dk * ease;
        transformRef.current = zoomIdentity.translate(newX, newY).scale(newK);
        needsNextFrame = true;
      } else if (dx !== 0 || dy !== 0 || dk !== 0) {
        transformRef.current = zoomIdentity.translate(target.x, target.y).scale(keepZoom ? t.k : target.k);
      }

      const canvasNode = canvas as unknown as { __zoom?: ZoomTransform };
      if (canvasNode.__zoom) {
        canvasNode.__zoom = transformRef.current;
      }
    }

    // Node position easing
    if (!isLayoutSettledRef.current) {
      let anyMoving = false;
      const factor = Math.min(1, 0.12 * dtScale);
      for (const node of nodesMap.current.values()) {
        const dx = node.targetX - node.x;
        const dy = node.targetY - node.y;
        if (Math.abs(dx) > 0.05 || Math.abs(dy) > 0.05) {
          node.x += dx * factor;
          node.y += dy * factor;
          anyMoving = true;
        } else if (dx !== 0 || dy !== 0) {
          node.x = node.targetX;
          node.y = node.targetY;
        }
      }
      if (anyMoving) {
        needsNextFrame = true;
      } else {
        isLayoutSettledRef.current = true;
        const edgeList = edges.current;
        for (let i = 0; i < edgeList.length; i++) {
          const edge = edgeList[i];
          const cp = computeControlPoint(
            edge.source.x,
            edge.source.y,
            edge.target.x,
            edge.target.y,
            edge.source.id,
            edge.target.id
          );
          edge.cx = cp.cx;
          edge.cy = cp.cy;
          edge.cxValid = true;
        }
      }
    }

    ctx.clearRect(0, 0, width, height);

    // Starfield Backdrop
    const t = transformRef.current;
    const invK = 1 / t.k;
    const minX = -t.x * invK - 100;
    const maxX = (width - t.x) * invK + 100;
    const minY = -t.y * invK - 100;
    const maxY = (height - t.y) * invK + 100;
    const isLight = propsRef.current.palette === 'light';
    const isCurved = propsRef.current.edgeStyle === 'curved';
    const theme = themeRef.current;

    ctx.save();
    ctx.translate(t.x * 0.2, t.y * 0.2);
    ctx.scale(t.k, t.k);
    const stars = starsRef.current;
    for (let i = 0; i < stars.length; i++) {
      const star = stars[i];
      if (star.x >= minX && star.x <= maxX && star.y >= minY && star.y <= maxY) {
        ctx.fillStyle = isLight ? star.lightColor : star.darkColor;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, TWO_PI);
        ctx.fill();
      }
    }
    ctx.restore();

    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.scale(t.k, t.k);

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const traceEdge = (edge: Edge) => {
      const x1 = edge.source.x;
      const y1 = edge.source.y;
      const x2 = edge.target.x;
      const y2 = edge.target.y;

      ctx.moveTo(x1, y1);
      if (isCurved) {
        if (edge.cxValid) {
          ctx.quadraticCurveTo(edge.cx, edge.cy, x2, y2);
        } else {
          const cp = computeControlPoint(x1, y1, x2, y2, edge.source.id, edge.target.id);
          ctx.quadraticCurveTo(cp.cx, cp.cy, x2, y2);
        }
      } else {
        ctx.lineTo(x2, y2);
      }
    };

    const edgeList = edges.current;

    ctx.save();
    ctx.globalCompositeOperation = isLight ? 'multiply' : 'lighter';

    // 1. Draw SIDE EDGES
    let lastAlpha = -1;
    let lastWidth = -1;
    let lastStroke = '';
    for (let i = 0; i < edgeList.length; i++) {
      const edge = edgeList[i];
      if (edge.isMain) continue;
      const sx = edge.source.x;
      const sy = edge.source.y;
      const tx = edge.target.x;
      const ty = edge.target.y;
      if (
        (sx < minX || sx > maxX || sy < minY || sy > maxY) &&
        (tx < minX || tx > maxX || ty < minY || ty > maxY)
      ) {
        continue;
      }
      ctx.beginPath();
      traceEdge(edge);
      if (edge.target.sideEdgeColor !== lastStroke) {
        lastStroke = edge.target.sideEdgeColor;
        ctx.strokeStyle = lastStroke;
      }
      const lineW = edge.target.edgeWidth * invK;
      if (lineW !== lastWidth) {
        lastWidth = lineW;
        ctx.lineWidth = lineW;
      }
      if (edge.target.depthAlpha !== lastAlpha) {
        lastAlpha = edge.target.depthAlpha;
        ctx.globalAlpha = lastAlpha;
      }
      ctx.stroke();
    }

    // 2. Draw MAIN PATH EDGES
    ctx.globalAlpha = 1.0;
    ctx.strokeStyle = theme.mainEdgeRgba;
    lastWidth = -1;
    for (let i = 0; i < edgeList.length; i++) {
      const edge = edgeList[i];
      if (!edge.isMain) continue;
      const sx = edge.source.x;
      const sy = edge.source.y;
      const tx = edge.target.x;
      const ty = edge.target.y;
      if (
        (sx < minX || sx > maxX || sy < minY || sy > maxY) &&
        (tx < minX || tx > maxX || ty < minY || ty > maxY)
      ) {
        continue;
      }
      ctx.beginPath();
      traceEdge(edge);
      const lineW = edge.target.edgeWidth * invK;
      if (lineW !== lastWidth) {
        lastWidth = lineW;
        ctx.lineWidth = lineW;
      }
      ctx.stroke();
    }

    ctx.restore();

    // 3. Draw HOVERED EDGES
    const hoveredSet = hoveredPathSetRef.current;
    if (hoveredSet.size > 0) {
      ctx.beginPath();
      for (let i = 0; i < edgeList.length; i++) {
        const edge = edgeList[i];
        if (hoveredSet.has(edge.source.id) && hoveredSet.has(edge.target.id)) {
          traceEdge(edge);
        }
      }
      ctx.save();
      const hoverColor = isLight ? '#d80073' : '#ff00b8';
      ctx.strokeStyle = hoverColor;
      ctx.lineWidth = 4.5 * invK;
      ctx.shadowColor = hoverColor;
      ctx.shadowBlur = 10 * invK;
      ctx.stroke();
      ctx.restore();
    }

    // 4. Smooth continuous comet descent animation
    const active = activePathRef.current;
    if (active && active.nodes.length > 0) {
      const pathNodes = active.nodes;
      const maxIdx = pathNodes.length - 1;
      const progress = Math.min(active.progress, maxIdx);
      const currentIdx = Math.floor(progress);
      const fraction = progress - currentIdx;

      // Draw path traversed so far
      ctx.beginPath();
      for (let i = 0; i < currentIdx; i++) {
        const p0 = pathNodes[i];
        const p1 = pathNodes[i + 1];
        ctx.moveTo(p0.x, p0.y);
        if (isCurved) {
          const cp = computeControlPoint(p0.x, p0.y, p1.x, p1.y, p0.id, p1.id);
          ctx.quadraticCurveTo(cp.cx, cp.cy, p1.x, p1.y);
        } else {
          ctx.lineTo(p1.x, p1.y);
        }
      }
      ctx.strokeStyle = theme.activePath;
      ctx.lineWidth = 5 * invK;
      ctx.stroke();

      // Ring visited nodes
      ctx.strokeStyle = theme.pulseFill;
      ctx.lineWidth = 1.5 * invK;
      const ringPad = 1.5 * invK;
      for (let i = 0; i <= currentIdx && i < pathNodes.length; i++) {
        const n = pathNodes[i];
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius + ringPad, 0, TWO_PI);
        ctx.stroke();
      }

      // Compute smooth comet coordinates along the active branch
      let lightX = pathNodes[currentIdx].x;
      let lightY = pathNodes[currentIdx].y;

      if (currentIdx < maxIdx) {
        const p0 = pathNodes[currentIdx];
        const p1 = pathNodes[currentIdx + 1];

        if (isCurved) {
          const cp = computeControlPoint(p0.x, p0.y, p1.x, p1.y, p0.id, p1.id);
          const u = fraction;
          const invU = 1 - u;
          lightX = invU * invU * p0.x + 2 * invU * u * cp.cx + u * u * p1.x;
          lightY = invU * invU * p0.y + 2 * invU * u * cp.cy + u * u * p1.y;

          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.quadraticCurveTo(
            p0.x + u * (cp.cx - p0.x),
            p0.y + u * (cp.cy - p0.y),
            lightX,
            lightY
          );
          ctx.strokeStyle = theme.activePath;
          ctx.lineWidth = 5 * invK;
          ctx.stroke();
        } else {
          lightX = p0.x + fraction * (p1.x - p0.x);
          lightY = p0.y + fraction * (p1.y - p0.y);

          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(lightX, lightY);
          ctx.strokeStyle = theme.activePath;
          ctx.lineWidth = 5 * invK;
          ctx.stroke();
        }
      }

      // Wake particles behind comet head
      if (!propsRef.current.isPaused && Math.random() < 0.25) {
        particlesRef.current.push({
          x: lightX,
          y: lightY,
          vx: (Math.random() - 0.5) * 0.8,
          vy: (Math.random() - 0.5) * 0.8,
          alpha: 1.0,
          size: Math.random() * 1.8 + 0.6,
          color: theme.pulseShadow,
        });
      }

      // Draw glowing traveling comet
      ctx.save();
      ctx.beginPath();
      const cometR = 5 * invK;
      ctx.arc(lightX, lightY, cometR, 0, TWO_PI);
      ctx.fillStyle = theme.pulseFill;
      ctx.shadowColor = theme.pulseShadow;
      ctx.shadowBlur = 12 * invK;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(lightX, lightY, cometR + 2.5 * invK, 0, TWO_PI);
      ctx.strokeStyle = theme.pulseShadow;
      ctx.lineWidth = 1.5 * invK;
      ctx.stroke();
      ctx.restore();

      // Compute current & upcoming segment lengths to prevent whiplash on long moves
      const refStepDist = 80;
      let currentEdgeDist = refStepDist;
      let nextEdgeDist = refStepDist;
      if (currentIdx < maxIdx) {
        const p0 = pathNodes[currentIdx];
        const p1 = pathNodes[currentIdx + 1];
        currentEdgeDist = Math.hypot(p1.x - p0.x, p1.y - p0.y) || refStepDist;
        if (currentIdx + 1 < maxIdx) {
          const p2 = pathNodes[currentIdx + 2];
          nextEdgeDist = Math.hypot(p2.x - p1.x, p2.y - p1.y) || refStepDist;
        }
      }

      const effectiveJumpDist = Math.max(currentEdgeDist, nextEdgeDist * fraction);
      const zoomOutRatio = Math.min(1, Math.max(0, (effectiveJumpDist - refStepDist * 1.5) / 600));
      const targetK = userZoomedDuringFollowRef.current
        ? transformRef.current.k
        : 1.2 - zoomOutRatio * 0.35;
      cameraTargetRef.current = {
        x: width / 2 - lightX * targetK,
        y: height * 0.5 - lightY * targetK,
        k: targetK,
      };

      if (!propsRef.current.isPaused && active.progress < maxIdx) {
        const speedMultipliers = [0.006, 0.012, 0.022, 0.04, 0.075];
        const baseSpeed = speedMultipliers[propsRef.current.speed - 1] || 0.022;
        const distRatio = Math.max(1, currentEdgeDist / refStepDist);
        const distanceScale = 1 / Math.pow(distRatio, 0.9);

        let turnFactor = 1.0;
        if (currentEdgeDist > refStepDist * 1.6) {
          turnFactor *= 0.55 + 0.45 * Math.sin(fraction * Math.PI);
        }
        if (nextEdgeDist > refStepDist * 1.8 && fraction > 0.6) {
          const approach = (fraction - 0.6) / 0.4;
          turnFactor *= 1 - 0.45 * approach;
        }

        const wasComplete = active.progress >= maxIdx;
        active.progress += baseSpeed * distanceScale * turnFactor * dtScale;
        if (active.progress >= maxIdx) {
          active.progress = maxIdx;
          if (!wasComplete && propsRef.current.onPathComplete) {
            propsRef.current.onPathComplete();
          }
        } else {
          needsNextFrame = true;
        }
      }
    }

    // 5. Draw active particles
    const particles = particlesRef.current;
    if (particles.length > 0) {
      ctx.save();
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx * dtScale;
        p.y += p.vy * dtScale;
        p.alpha -= 0.026 * dtScale;
        if (p.alpha <= 0) {
          particles.splice(i, 1);
          continue;
        }

        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, TWO_PI);
        ctx.fill();
      }
      ctx.restore();
      if (particles.length > 0) {
        needsNextFrame = true;
      }
    }

    const nodeFill = theme.nodeFill;

    // 6. Draw SIDE NODES
    ctx.fillStyle = nodeFill;
    ctx.lineWidth = 1.8 * invK;
    lastAlpha = -1;
    for (const node of nodesMap.current.values()) {
      if (!node.isMainPath && node.x >= minX && node.x <= maxX && node.y >= minY && node.y <= maxY) {
        ctx.beginPath();
        const isHovered = hoveredSet.has(node.id);
        const r = isHovered ? node.hoveredRadius : node.radius;
        ctx.arc(node.x, node.y, r, 0, TWO_PI);

        if (node.depthAlpha !== lastAlpha) {
          lastAlpha = node.depthAlpha;
          ctx.globalAlpha = lastAlpha;
        }
        ctx.fill();
        ctx.strokeStyle = node.nodeColor;
        ctx.stroke();
      }
    }

    // 7. Draw SIDE NODE TEXT (when zoomed in)
    if (t.k > 0.8) {
      ctx.font = `600 ${6.5}px 'Outfit', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = theme.sideTextCanvasColor;
      lastAlpha = -1;
      for (const node of nodesMap.current.values()) {
        if (!node.isMainPath && node.x >= minX && node.x <= maxX && node.y >= minY && node.y <= maxY) {
          if (node.depthAlpha !== lastAlpha) {
            lastAlpha = node.depthAlpha;
            ctx.globalAlpha = lastAlpha;
          }
          ctx.fillText(node.idStr, node.x, node.y);
        }
      }
    }

    // 8. Draw MAIN NODES
    ctx.globalAlpha = 1.0;
    ctx.fillStyle = nodeFill;
    ctx.lineWidth = 2.8 * invK;
    ctx.strokeStyle = theme.mainNodeColor;
    for (const node of nodesMap.current.values()) {
      if (node.isMainPath && node.x >= minX && node.x <= maxX && node.y >= minY && node.y <= maxY) {
        ctx.beginPath();
        const isHovered = hoveredSet.has(node.id);
        const r = isHovered ? node.hoveredRadius : node.radius;
        ctx.arc(node.x, node.y, r, 0, TWO_PI);
        ctx.fill();
        ctx.stroke();
      }
    }

    // 9. Draw MAIN NODE TEXT
    ctx.font = `700 ${9}px 'Outfit', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = theme.mainTextColor;
    for (const node of nodesMap.current.values()) {
      if (node.isMainPath && node.x >= minX && node.x <= maxX && node.y >= minY && node.y <= maxY) {
        ctx.fillText(node.idStr, node.x, node.y);
      }
    }

    ctx.restore();

    if (needsNextFrame) {
      rafIdRef.current = requestAnimationFrame((nextT) => drawRef.current(nextT));
    }
  };

  useImperativeHandle(ref, () => ({
    buildTree: (seed: number, onComplete: () => void) => {
      if (activeTaskRef.current.rafId !== undefined) {
        cancelAnimationFrame(activeTaskRef.current.rafId);
      }
      activeTaskRef.current.isRunning = true;
      setIsAnimating(true);
      initSingleNode();
      scheduleDraw();

      activeTaskRef.current.rafId = requestAnimationFrame(() => {
        activeTaskRef.current.rafId = undefined;
        if (!activeTaskRef.current.isRunning) return;

        let current = seed;
        const pathSeq: number[] = [];
        while (current > 1) {
          pathSeq.push(current);
          current = current % 2 === 0 ? current / 2 : current * 3 + 1;
        }
        pathSeq.push(1);
        pathSeq.reverse(); // [1, ..., seed]

        let branchTips: Node[] = [];
        const a11yFrag = a11yContainerRef.current ? document.createDocumentFragment() : undefined;

        const densVal = propsRef.current.density;
        const targetNodes =
          densVal === 'low'
            ? Math.min(300, pathSeq.length * 6)
            : densVal === 'medium'
              ? Math.min(1000, pathSeq.length * 20)
              : Math.min(2000, pathSeq.length * 40);

        const branchProb = densVal === 'low' ? 0.12 : densVal === 'medium' ? 0.28 : 0.45;

        // 1. Synchronously build main path
        for (let step = 1; step < pathSeq.length; step++) {
          const val = pathSeq[step];
          const prevVal = pathSeq[step - 1];
          const parent = nodesMap.current.get(prevVal)!;

          const node = addNode(val, parent, true, a11yFrag);

          const c1 = node.id * 2;
          const c2 = (node.id - 1) / 3;

          if (!nodesMap.current.has(c1) && Math.random() < branchProb) branchTips.push(node);
          if (node.id > 4 && (node.id - 1) % 3 === 0 && !nodesMap.current.has(c2)) branchTips.push(node);
        }

        // 2. Synchronously sprout side branches
        let panic = 0;
        while (branchTips.length > 0 && nodesMap.current.size < targetNodes && panic < 250) {
          const newTips: Node[] = [];
          for (let i = 0; i < branchTips.length; i++) {
            if (nodesMap.current.size > targetNodes) break;
            const tip = branchTips[i];

            const t1 = tip.id * 2;
            const t2 = (tip.id - 1) / 3;

            let pushed = false;
            if (!nodesMap.current.has(t1)) {
              if (Math.random() < 0.78) {
                newTips.push(addNode(t1, tip, false, a11yFrag));
                pushed = true;
              } else {
                newTips.push(tip);
                pushed = true;
              }
            }
            if (tip.id > 4 && (tip.id - 1) % 3 === 0) {
              if (t2 % 2 !== 0 && t2 > 1 && !nodesMap.current.has(t2)) {
                if (Math.random() < 0.88) {
                  newTips.push(addNode(t2, tip, false, a11yFrag));
                } else if (!pushed) {
                  newTips.push(tip);
                }
              }
            }
          }
          if (newTips.length > 150) {
            for (let i = 0; i < 100; i++) {
              const j = i + Math.floor(Math.random() * (newTips.length - i));
              const tmp = newTips[i];
              newTips[i] = newTips[j];
              newTips[j] = tmp;
            }
            newTips.length = 100;
          }
          branchTips = newTips;
          panic++;
        }

        if (a11yFrag && a11yContainerRef.current) {
          a11yContainerRef.current.appendChild(a11yFrag);
        }

        // Calculate subtree weights in O(N) via depth buckets and precompute static metrics/colors
        const buckets: Node[][] = [];
        let maxDepth = 0;
        for (const node of nodesMap.current.values()) {
          node.weight = 1;
          if (node.depth > maxDepth) maxDepth = node.depth;
          let bucket = buckets[node.depth];
          if (!bucket) {
            bucket = [];
            buckets[node.depth] = bucket;
          }
          bucket.push(node);
        }
        for (let d = maxDepth; d >= 1; d--) {
          const bucket = buckets[d];
          if (!bucket) continue;
          for (let i = 0; i < bucket.length; i++) {
            const node = bucket[i];
            if (node.parent !== null) {
              const p = nodesMap.current.get(node.parent);
              if (p) {
                p.weight += node.weight;
              }
            }
          }
        }

        const theme = themeRef.current;
        for (const node of nodesMap.current.values()) {
          computeNodeMetrics(node);
          applyThemeToNode(node, theme);
        }

        recalculateLayout();

        // Center camera on seed
        const canvas = canvasRef.current;
        if (canvas) {
          const seedNode = nodesMap.current.get(seed);
          const k = 1.15;
          cameraTargetRef.current = {
            x: canvas.width / 2 - (seedNode ? seedNode.x * k : 0),
            y: canvas.height * 0.4 - (seedNode ? seedNode.y * k : 0),
            k,
          };
        }

        activeTaskRef.current.isRunning = false;
        setIsAnimating(false);
        scheduleDraw();
        onComplete();
      });
    },
    followPathDown: (seed: number) => {
      const fullPath: Node[] = [];
      let c: number | null = seed;
      while (c !== null) {
        const n: Node | undefined = nodesMap.current.get(c);
        if (!n) break;
        fullPath.push(n);
        c = n.parent;
      }
      userZoomedDuringFollowRef.current = false;
      activePathRef.current = {
        nodes: fullPath,
        progress: 0,
      };
      scheduleDraw();
    },
    setExploreMode: (explore: boolean) => {
      isExploreModeRef.current = explore;
      scheduleDraw();
    },
    focusOnNode: (id: number) => {
      const node = nodesMap.current.get(id);
      if (node && canvasRef.current) {
        const canvas = canvasRef.current;
        const targetK = 1.8;
        cameraTargetRef.current = {
          x: canvas.width / 2 - node.x * targetK,
          y: canvas.height * 0.5 - node.y * targetK,
          k: targetK,
        };
        setHoveredNode(node);
        scheduleDraw();
      }
    },
    recalculateLayout: () => {
      recalculateLayout();
    },
    stopBuilding: () => {
      if (activeTaskRef.current.rafId !== undefined) {
        cancelAnimationFrame(activeTaskRef.current.rafId);
        activeTaskRef.current.rafId = undefined;
      }
      activeTaskRef.current.isRunning = false;
      setIsAnimating(false);
    },
    zoomIn: () => {
      if (canvasRef.current && zoomBehaviorRef.current) {
        select(canvasRef.current).transition().duration(250).call(zoomBehaviorRef.current.scaleBy, 1.4);
      }
    },
    zoomOut: () => {
      if (canvasRef.current && zoomBehaviorRef.current) {
        select(canvasRef.current).transition().duration(250).call(zoomBehaviorRef.current.scaleBy, 1 / 1.4);
      }
    },
    resetView: () => {
      userZoomedDuringFollowRef.current = false;
      if (canvasRef.current && zoomBehaviorRef.current) {
        const canvas = canvasRef.current;
        const initialTransform = zoomIdentity.translate(canvas.width / 2, canvas.height * 0.85).scale(1.0);
        select(canvas).transition().duration(350).call(zoomBehaviorRef.current.transform, initialTransform);
      }
    },
    exportImage: () => {
      const nodes = Array.from(nodesMap.current.values());
      if (nodes.length === 0) return null;

      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const n of nodes) {
        const x = n.targetX ?? n.x;
        const y = n.targetY ?? n.y;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }

      const padding = 100;
      const vx = minX - padding;
      const vy = minY - padding;
      const worldW = Math.max(400, maxX - minX + padding * 2);
      const worldH = Math.max(400, maxY - minY + padding * 2);
      const theme = themeRef.current;
      const isCurved = propsRef.current.edgeStyle === 'curved';

      const buildEdgePath = (edge: Edge) => {
        const x1 = edge.source.targetX ?? edge.source.x;
        const y1 = edge.source.targetY ?? edge.source.y;
        const x2 = edge.target.targetX ?? edge.target.x;
        const y2 = edge.target.targetY ?? edge.target.y;

        if (isCurved) {
          const cp = computeControlPoint(x1, y1, x2, y2, edge.source.id, edge.target.id);
          return `M ${x1.toFixed(2)} ${y1.toFixed(2)} Q ${cp.cx.toFixed(2)} ${cp.cy.toFixed(2)} ${x2.toFixed(2)} ${y2.toFixed(2)}`;
        }
        return `M ${x1.toFixed(2)} ${y1.toFixed(2)} L ${x2.toFixed(2)} ${y2.toFixed(2)}`;
      };

      const parts: string[] = [];
      parts.push(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx.toFixed(1)} ${vy.toFixed(1)} ${worldW.toFixed(1)} ${worldH.toFixed(1)}" width="${Math.round(worldW)}" height="${Math.round(worldH)}">`,
        `<defs><style>text { font-family: 'Outfit', system-ui, -apple-system, sans-serif; user-select: none; }</style></defs>`,
        `<rect x="${vx.toFixed(1)}" y="${vy.toFixed(1)}" width="${worldW.toFixed(1)}" height="${worldH.toFixed(1)}" fill="${theme.svgBg}" />`,
        `<g stroke-linecap="round" stroke-linejoin="round" fill="none">`
      );

      // 1. Side edges
      for (const edge of edges.current) {
        if (!edge.isMain) {
          const d = buildEdgePath(edge);
          const color = edge.target.nodeColor;
          const w = edge.target.edgeWidth.toFixed(2);
          const alpha = (0.55 * edge.target.depthAlpha).toFixed(2);
          parts.push(`<path d="${d}" stroke="${color}" stroke-width="${w}" stroke-opacity="${alpha}" />`);
        }
      }

      // 2. Main path edges
      const mainEdgeColor = theme.mainEdgeHex;
      const mainEdgeAlpha = theme.mainEdgeAlpha.toFixed(2);
      for (const edge of edges.current) {
        if (edge.isMain) {
          const d = buildEdgePath(edge);
          const w = edge.target.edgeWidth.toFixed(2);
          parts.push(`<path d="${d}" stroke="${mainEdgeColor}" stroke-width="${w}" stroke-opacity="${mainEdgeAlpha}" />`);
        }
      }
      parts.push(`</g>`);

      // 3. Side nodes + labels
      const nodeFill = theme.nodeFill;
      const sideTextColor = theme.sideTextColor;
      parts.push(`<g>`);
      for (const node of nodes) {
        if (!node.isMainPath) {
          const nx = (node.targetX ?? node.x).toFixed(2);
          const ny = (node.targetY ?? node.y).toFixed(2);
          const r = node.radius.toFixed(2);
          const color = node.nodeColor;
          const alpha = node.depthAlpha.toFixed(2);
          parts.push(
            `<circle cx="${nx}" cy="${ny}" r="${r}" fill="${nodeFill}" stroke="${color}" stroke-width="1.8" opacity="${alpha}" />`,
            `<text x="${nx}" y="${ny}" fill="${sideTextColor}" opacity="${alpha}" font-size="6.5" font-weight="600" text-anchor="middle" dominant-baseline="central">${node.id}</text>`
          );
        }
      }

      // 4. Main path nodes + labels
      const mainTextColor = theme.mainTextColor;
      for (const node of nodes) {
        if (node.isMainPath) {
          const nx = (node.targetX ?? node.x).toFixed(2);
          const ny = (node.targetY ?? node.y).toFixed(2);
          const r = node.radius.toFixed(2);
          const color = node.nodeColor;
          parts.push(
            `<circle cx="${nx}" cy="${ny}" r="${r}" fill="${nodeFill}" stroke="${color}" stroke-width="2.8" />`,
            `<text x="${nx}" y="${ny}" fill="${mainTextColor}" font-size="9" font-weight="700" text-anchor="middle" dominant-baseline="central">${node.id}</text>`
          );
        }
      }
      parts.push(`</g></svg>`);

      const blob = new Blob([parts.join('\n')], { type: 'image/svg+xml;charset=utf-8' });
      return URL.createObjectURL(blob);
    },
  }));

  useEffect(() => {
    initSingleNode();

    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    ctxRef.current = canvas.getContext('2d');

    const resize = () => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      scheduleDraw();
    };

    window.addEventListener('resize', resize);
    resize();

    const zoomBehavior = zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.05, 15])
      .on('zoom', (e: D3ZoomEvent<HTMLCanvasElement, unknown>) => {
        if (activePathRef.current && Math.abs(e.transform.k - transformRef.current.k) > 1e-6) {
          userZoomedDuringFollowRef.current = true;
        }
        transformRef.current = e.transform;
        scheduleDraw();
      });
    zoomBehaviorRef.current = zoomBehavior;

    select(canvas).call(zoomBehavior).on('dblclick.zoom', null);

    const initialTransform = zoomIdentity.translate(canvas.width / 2, canvas.height * 0.85);
    transformRef.current = initialTransform;
    (canvas as unknown as { __zoom?: ZoomTransform }).__zoom = initialTransform;

    cameraTargetRef.current = {
      x: canvas.width / 2,
      y: canvas.height * 0.45,
      k: 1.1,
    };

    // Delegated a11y listeners
    const a11yEl = a11yContainerRef.current;
    const handleA11yClick = (e: Event) => {
      const btn = (e.target as HTMLElement | null)?.closest('button[data-node-id]') as HTMLButtonElement | null;
      if (!btn) return;
      const id = Number(btn.dataset.nodeId);
      if (id && propsRef.current.onSelectNode) {
        propsRef.current.onSelectNode(id);
      }
    };
    const handleA11yFocusIn = (e: FocusEvent) => {
      const btn = (e.target as HTMLElement | null)?.closest('button[data-node-id]') as HTMLButtonElement | null;
      if (!btn) return;
      const id = Number(btn.dataset.nodeId);
      const n = nodesMap.current.get(id);
      if (n && canvasRef.current) {
        const targetK = 1.8;
        cameraTargetRef.current = {
          x: canvasRef.current.width / 2 - n.x * targetK,
          y: canvasRef.current.height * 0.5 - n.y * targetK,
          k: targetK,
        };
        setHoveredNode(n);
        scheduleDraw();
      }
    };
    a11yEl?.addEventListener('click', handleA11yClick);
    a11yEl?.addEventListener('focusin', handleA11yFocusIn);

    // Node hovering & selection on canvas click / hold
    let startX = 0;
    let startY = 0;
    let longPressTimer: ReturnType<typeof setTimeout> | null = null;
    let hoverRafId: number | null = null;
    let pendingHoverX = 0;
    let pendingHoverY = 0;

    const clearLongPress = () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      setHoldingNodeId(null);
    };

    const getNodeAtScreenPos = (clientX: number, clientY: number, maxDistance = 22): Node | null => {
      const canvasNode = canvasRef.current;
      if (!canvasNode) return null;
      const rect = canvasNode.getBoundingClientRect();
      const mouseX = clientX - rect.left;
      const mouseY = clientY - rect.top;
      const [tx, ty] = transformRef.current.invert([mouseX, mouseY]);

      let closestNode: Node | null = null;
      let minDistSq = maxDistance * maxDistance;

      for (const node of nodesMap.current.values()) {
        const dxNode = node.x - tx;
        const dyNode = node.y - ty;
        const distSq = dxNode * dxNode + dyNode * dyNode;
        if (distSq < minDistSq) {
          minDistSq = distSq;
          closestNode = node;
        }
      }
      return closestNode;
    };

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (dx * dx + dy * dy > 100) {
        clearLongPress();
      }
      pendingHoverX = e.clientX;
      pendingHoverY = e.clientY;
      if (hoverRafId === null) {
        hoverRafId = requestAnimationFrame(() => {
          hoverRafId = null;
          const closest = getNodeAtScreenPos(pendingHoverX, pendingHoverY);
          setHoveredNode(prev => (prev?.id !== closest?.id ? closest : prev));
        });
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      startX = e.clientX;
      startY = e.clientY;
      const closest = getNodeAtScreenPos(e.clientX, e.clientY);
      if (closest) {
        setHoldingNodeId(closest.id);
        longPressTimer = setTimeout(() => {
          if (propsRef.current.onRequestSeed) {
            propsRef.current.onRequestSeed(closest.id);
          }
          setHoldingNodeId(null);
        }, 2000);
      }
    };

    const handleMouseUp = () => {
      clearLongPress();
    };

    const handleMouseLeave = () => {
      clearLongPress();
    };

    // Touch event listeners for mobile devices
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        startX = touch.clientX;
        startY = touch.clientY;
        const closest = getNodeAtScreenPos(touch.clientX, touch.clientY, 30);
        if (closest) {
          setHoveredNode(closest);
          setHoldingNodeId(closest.id);
          longPressTimer = setTimeout(() => {
            if (propsRef.current.onRequestSeed) {
              propsRef.current.onRequestSeed(closest.id);
            }
            setHoldingNodeId(null);
          }, 2000);
        }
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        const dx = touch.clientX - startX;
        const dy = touch.clientY - startY;
        if (dx * dx + dy * dy > 100) {
          clearLongPress();
        }
      }
    };

    const handleTouchEnd = () => {
      clearLongPress();
    };

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', handleMouseLeave);

    canvas.addEventListener('touchstart', handleTouchStart, { passive: true });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: true });
    canvas.addEventListener('touchend', handleTouchEnd);
    canvas.addEventListener('touchcancel', handleTouchEnd);

    scheduleDraw();

    const activeTask = activeTaskRef.current;
    return () => {
      window.removeEventListener('resize', resize);
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      if (hoverRafId !== null) cancelAnimationFrame(hoverRafId);
      if (activeTask.rafId !== undefined) cancelAnimationFrame(activeTask.rafId);

      clearLongPress();
      a11yEl?.removeEventListener('click', handleA11yClick);
      a11yEl?.removeEventListener('focusin', handleA11yFocusIn);

      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('mouseleave', handleMouseLeave);

      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.removeEventListener('touchend', handleTouchEnd);
      canvas.removeEventListener('touchcancel', handleTouchEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Compute Tooltip Overlay Placement
  let tooltipStyle: React.CSSProperties = { display: 'none' };
  if (hoveredNode && canvasRef.current) {
    const [screenX, screenY] = transformRef.current.apply([hoveredNode.x, hoveredNode.y]);
    tooltipStyle = {
      position: 'absolute',
      left: `${screenX + 16}px`,
      top: `${screenY - 16}px`,
      display: 'block',
      transform: 'translate(0, -50%)',
      pointerEvents: 'none',
      zIndex: 100,
    };
  }

  return (
    <div ref={containerRef} className="canvas-container" style={{ position: 'relative' }}>
      <div
        ref={a11yContainerRef}
        className="sr-only"
        aria-label="Collatz Tree Nodes. Tab to navigate through the tree."
      />

      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />

      {isAnimating && (
        <div className="growing-indicator">
          computing...
        </div>
      )}

      {hoveredNode && (
        <div className="canvas-tooltip" style={tooltipStyle}>
          <div className="tooltip-header">
            <span>#{hoveredNode.id}</span>
            <span>{hoveredNode.id % 2 === 0 ? 'even' : 'odd'}</span>
          </div>
          <div>
            <div className="tooltip-row">
              <span>next step:</span>
              <span>
                {hoveredNode.id % 2 === 0
                  ? `${hoveredNode.id} ÷ 2 = ${hoveredNode.id / 2}`
                  : `3 × ${hoveredNode.id} + 1 = ${hoveredNode.id * 3 + 1}`
                }
              </span>
            </div>
            <div className="tooltip-row">
              <span>steps to one:</span>
              <span>{hoveredNode.depth}</span>
            </div>
            {hoveredNode.parent && (
              <div className="tooltip-row">
                <span>parent:</span>
                <span>#{hoveredNode.parent}</span>
              </div>
            )}
          </div>
          <div className="tooltip-footer">
            {holdingNodeId === hoveredNode.id ? (
              <div className="hold-indicator">
                <div className="hold-bar-fill" />
                <span>planting seed...</span>
              </div>
            ) : (
              <span>hold for 2s to plant as seed</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

CollatzTree.displayName = 'CollatzTree';

export default memo(CollatzTree);

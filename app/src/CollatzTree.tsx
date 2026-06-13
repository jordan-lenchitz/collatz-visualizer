import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import * as d3 from 'd3';

export interface CollatzTreeRef {
  buildTree: (seed: number, onComplete: () => void) => void;
  followPathDown: (seed: number) => void;
  setExploreMode: (explore: boolean) => void;
  focusOnNode: (id: number) => void;
  recalculateLayout: () => void;
}

interface Node {
  id: number;
  x: number;
  y: number;
  angle: number;
  parent: number | null;
  depth: number;
  isMainPath: boolean;
  targetX: number;
  targetY: number;
}

interface CollatzTreeProps {
  speed: number;
  isPaused: boolean;
  palette: 'dark' | 'light';
  layoutMode: 'organic' | 'radial' | 'symmetric' | 'force';
  edgeStyle: 'curved' | 'straight';
  density: 'low' | 'medium' | 'high';
  hoveredNodeId: number | null;
  onHoverNode: (id: number | null) => void;
  onSelectNode: (id: number) => void;
}

const CollatzTree = forwardRef<CollatzTreeRef, CollatzTreeProps>((props, ref) => {
  const propsRef = useRef(props);
  useEffect(() => {
    propsRef.current = props;
  }, [props]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const nodesMap = useRef<Map<number, Node>>(new Map());
  const edges = useRef<{source: Node, target: Node, isMain: boolean}[]>([]);
  
  const transformRef = useRef(d3.zoomIdentity);
  const cameraTargetRef = useRef<{x: number, y: number, k: number} | null>(null);
  const animationRef = useRef<number | undefined>(undefined);
  
  const activeTaskRef = useRef<{ timeoutId?: number, isRunning: boolean }>({ isRunning: false });
  const activePathRef = useRef<{ nodes: Node[], progress: number } | null>(null);
  const isExploreModeRef = useRef(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const lastTimeRef = useRef<number>(0);

  // Hover states
  const [hoveredNode, setHoveredNode] = useState<Node | null>(null);
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
  
  const starsRef = useRef<{ x: number; y: number; size: number; opacity: number }[]>([]);

  // D3 force simulation
  const simulationRef = useRef<d3.Simulation<any, undefined> | null>(null);

  // Sync hoveredPathSetRef when hoveredNode changes
  useEffect(() => {
    const set = new Set<number>();
    if (hoveredNode) {
      let curr = hoveredNode;
      while (curr) {
        set.add(curr.id);
        const parentId = curr.parent;
        curr = parentId ? nodesMap.current.get(parentId)! : null as any;
      }
    }
    hoveredPathSetRef.current = set;
    props.onHoverNode(hoveredNode ? hoveredNode.id : null);
  }, [hoveredNode]);

  // Sync external hover state
  useEffect(() => {
    if (props.hoveredNodeId !== undefined) {
      const node = props.hoveredNodeId ? nodesMap.current.get(props.hoveredNodeId) || null : null;
      if (node !== hoveredNode) {
        setHoveredNode(node);
      }
    }
  }, [props.hoveredNodeId]);

  // Pre-generate background stars for space/constellation effect
  useEffect(() => {
    const list = [];
    for (let i = 0; i < 250; i++) {
      list.push({
        x: (Math.random() - 0.5) * 6000,
        y: (Math.random() - 0.5) * 6000,
        size: Math.random() * 1.5 + 0.5,
        opacity: Math.random() * 0.5 + 0.2
      });
    }
    starsRef.current = list;
  }, []);

  const stopForceSimulation = () => {
    if (simulationRef.current) {
      simulationRef.current.stop();
      simulationRef.current = null;
    }
  };

  // 1. Organic (Harriss-style Fractal) layout
  const computeOrganicLayout = (nodes: Map<number, Node>) => {
    const visited = new Set<number>();
    const childrenOf = new Map<number, number[]>();
    for (const node of nodes.values()) {
      if (node.parent !== null) {
        const parentId = node.parent;
        if (!childrenOf.has(parentId)) childrenOf.set(parentId, []);
        childrenOf.get(parentId)!.push(node.id);
      }
    }

    const root = nodes.get(1);
    if (root) {
      root.targetX = 0;
      root.targetY = 0;
      root.angle = -Math.PI / 2;
    }

    const traverse = (id: number) => {
      visited.add(id);
      const parentNode = nodes.get(id);
      if (!parentNode) return;

      const children = childrenOf.get(id) || [];
      for (const childId of children) {
        if (visited.has(childId)) continue;
        const childNode = nodes.get(childId);
        if (!childNode) continue;

        let angle = parentNode.angle;
        const isEvenChild = childId === id * 2;

        if (isEvenChild) {
          angle += -0.15 + Math.sin(childId) * 0.02;
        } else {
          angle += 0.55 + Math.sin(childId) * 0.02;
        }

        // Slight self-centering pull upwards
        const upAngle = -Math.PI / 2;
        let diff = upAngle - angle;
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        angle += diff * 0.08;

        const len = (childNode.isMainPath ? 55 : 42) * Math.pow(0.993, parentNode.depth);
        childNode.angle = angle;
        childNode.targetX = parentNode.targetX + Math.cos(angle) * len;
        childNode.targetY = parentNode.targetY + Math.sin(angle) * len;

        traverse(childId);
      }
    };

    traverse(1);
  };

  // 2. Celestial (Radial Spiral) layout
  const computeRadialLayout = (nodes: Map<number, Node>) => {
    const visited = new Set<number>();
    const childrenOf = new Map<number, number[]>();
    for (const node of nodes.values()) {
      if (node.parent !== null) {
        const parentId = node.parent;
        if (!childrenOf.has(parentId)) childrenOf.set(parentId, []);
        childrenOf.get(parentId)!.push(node.id);
      }
    }

    const root = nodes.get(1);
    if (root) {
      root.targetX = 0;
      root.targetY = 0;
      root.angle = -Math.PI / 2;
    }

    const traverse = (id: number) => {
      visited.add(id);
      const parentNode = nodes.get(id);
      if (!parentNode) return;

      const children = childrenOf.get(id) || [];
      for (const childId of children) {
        if (visited.has(childId)) continue;
        const childNode = nodes.get(childId);
        if (!childNode) continue;

        let angle = parentNode.angle;
        if (childId === id * 2) {
          angle += 0.22;
        } else {
          angle -= 0.82;
        }

        childNode.angle = angle;
        const R = childNode.depth * 38;
        childNode.targetX = Math.cos(angle) * R;
        childNode.targetY = Math.sin(angle) * R;

        traverse(childId);
      }
    };

    traverse(1);
  };

  // 3. Symmetric (Binary Spine) layout
  const computeSymmetricLayout = (nodes: Map<number, Node>) => {
    const visited = new Set<number>();
    const childrenOf = new Map<number, number[]>();
    for (const node of nodes.values()) {
      if (node.parent !== null) {
        const parentId = node.parent;
        if (!childrenOf.has(parentId)) childrenOf.set(parentId, []);
        childrenOf.get(parentId)!.push(node.id);
      }
    }

    const root = nodes.get(1) as any;
    if (root) {
      root.targetX = 0;
      root.targetY = 0;
      root.span = 600;
    }

    const traverse = (id: number) => {
      visited.add(id);
      const parentNode = nodes.get(id) as any;
      if (!parentNode) return;

      const children = childrenOf.get(id) || [];
      const hasTwoChildren = children.length >= 2;

      for (const childId of children) {
        if (visited.has(childId)) continue;
        const childNode = nodes.get(childId) as any;
        if (!childNode) continue;

        childNode.targetY = -childNode.depth * 52;

        if (hasTwoChildren) {
          const isEven = childId === id * 2;
          childNode.span = parentNode.span * 0.5;
          childNode.targetX = parentNode.targetX + (isEven ? -parentNode.span * 0.5 : parentNode.span * 0.5);
        } else {
          childNode.span = parentNode.span;
          childNode.targetX = parentNode.targetX; // keep straight
        }

        traverse(childId);
      }
    };

    traverse(1);
  };

  // 4. Force-directed Simulation layout
  const updateForceSimulation = () => {
    const nodeList = Array.from(nodesMap.current.values());
    const edgeList = edges.current.map(e => ({
      source: e.source.id,
      target: e.target.id
    }));

    if (!simulationRef.current) {
      simulationRef.current = d3.forceSimulation(nodeList)
        .force("link", d3.forceLink(edgeList).id((d: any) => d.id).distance(35))
        .force("charge", d3.forceManyBody().strength(-60))
        .force("center", d3.forceCenter(0, 0))
        .force("collide", d3.forceCollide().radius(18))
        .on("tick", () => {
          for (const node of nodeList) {
            node.targetX = node.x;
            node.targetY = node.y;
          }
        });
    } else {
      simulationRef.current.nodes(nodeList);
      (simulationRef.current.force("link") as any).links(edgeList);
      simulationRef.current.alpha(0.3).restart();
    }
  };

  const recalculateLayout = () => {
    const mode = propsRef.current.layoutMode;
    const nodes = nodesMap.current;
    if (nodes.size === 0) return;

    if (mode === 'organic') {
      stopForceSimulation();
      computeOrganicLayout(nodes);
    } else if (mode === 'radial') {
      stopForceSimulation();
      computeRadialLayout(nodes);
    } else if (mode === 'symmetric') {
      stopForceSimulation();
      computeSymmetricLayout(nodes);
    } else if (mode === 'force') {
      updateForceSimulation();
    }
  };

  // Recalculate when props change
  useEffect(() => {
    recalculateLayout();
  }, [props.layoutMode, props.density]);

  const initSingleNode = () => {
    nodesMap.current.clear();
    edges.current = [];
    activePathRef.current = null;
    cameraTargetRef.current = null;
    
    nodesMap.current.set(1, {
      id: 1,
      x: 0,
      y: 0,
      angle: -Math.PI / 2,
      parent: null,
      depth: 0,
      isMainPath: true,
      targetX: 0,
      targetY: 0
    });
  };

  const addNode = (val: number, parent: Node, isMainPath: boolean): Node => {
    // We spawn initially at parent x,y with a tiny jitter, then let layout recalculation place them
    // This jitter prevents d3 force simulation from exploding due to exactly overlapping nodes
    const jitterX = (Math.random() - 0.5) * 1.0;
    const jitterY = (Math.random() - 0.5) * 1.0;
    const node: Node = {
      id: val,
      x: parent.x + jitterX,
      y: parent.y + jitterY,
      angle: parent.angle,
      parent: parent.id,
      depth: parent.depth + 1,
      isMainPath,
      targetX: parent.x + jitterX,
      targetY: parent.y + jitterY
    };
    
    nodesMap.current.set(val, node);
    edges.current.push({ source: parent, target: node, isMain: isMainPath });
    return node;
  };

  // Evaluate point along a quadratic bezier curve
  const getPointOnCurve = (x1: number, y1: number, cx: number, cy: number, x2: number, y2: number, t: number) => {
    const mt = 1 - t;
    const px = mt * mt * x1 + 2 * mt * t * cx + t * t * x2;
    const py = mt * mt * y1 + 2 * mt * t * cy + t * t * y2;
    return [px, py];
  };

  const draw = (time: number) => {
    const dt = lastTimeRef.current ? (time - lastTimeRef.current) : 16.6;
    lastTimeRef.current = time;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    
    // Camera follow logic
    if (cameraTargetRef.current && !isExploreModeRef.current) {
      const target = cameraTargetRef.current;
      const t = transformRef.current;
      
      const ease = 0.08;
      const newX = t.x + (target.x - t.x) * ease;
      const newY = t.y + (target.y - t.y) * ease;
      const newK = t.k + (target.k - t.k) * ease;
      
      transformRef.current = d3.zoomIdentity.translate(newX, newY).scale(newK);
      
      const selection = d3.select(canvas);
      if ((selection.node() as any).__zoom) {
         (selection.node() as any).__zoom = transformRef.current;
      }
    }

    // Node interpolation
    for (const node of nodesMap.current.values()) {
      if (propsRef.current.layoutMode === 'force') {
        // Let D3 force write directly to coordinates
      } else {
        node.x += (node.targetX - node.x) * 0.12 * (dt / 16.6);
        node.y += (node.targetY - node.y) * 0.12 * (dt / 16.6);
      }
    }

    ctx.clearRect(0, 0, width, height);
    
    // Starfield Backdrop
    ctx.save();
    const t = transformRef.current;
    const minX = -t.x / t.k - 100;
    const maxX = (width - t.x) / t.k + 100;
    const minY = -t.y / t.k - 100;
    const maxY = (height - t.y) / t.k + 100;
    const isVisible = (x: number, y: number) => x >= minX && x <= maxX && y >= minY && y <= maxY;

    // Render background stars (parallax-like translation)
    ctx.translate(t.x * 0.2, t.y * 0.2);
    ctx.scale(t.k, t.k);
    for (const star of starsRef.current) {
      if (isVisible(star.x, star.y)) {
        ctx.fillStyle = propsRef.current.palette === 'light' ? `rgba(0, 0, 0, ${star.opacity * 0.3})` : `rgba(255, 255, 255, ${star.opacity})`;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.scale(t.k, t.k);

    // Removed coordinate grid to keep the canvas clean and avoid confusion with unconnected branches

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // Palette styles
    const colors = propsRef.current.palette === 'light' ? {
         sideEdge: 'rgba(0, 150, 80, 0.25)',
         mainEdge: 'rgba(0, 100, 200, 0.5)',
         hoveredEdge: '#d80073',
         sideNodeFill: '#ffffff',
         sideNodeStroke: 'rgba(0, 150, 80, 0.5)',
         sideText: 'rgba(0, 0, 0, 0.75)',
         mainNodeFill: '#ffffff',
         mainNodeStroke: '#0064c8',
         mainText: '#000000',
         activePath: 'rgba(0, 100, 200, 0.7)',
         pulseFill: '#0064c8',
         pulseShadow: '#00b8ff'
    } : {
         sideEdge: 'rgba(0, 255, 170, 0.22)',
         mainEdge: 'rgba(0, 184, 255, 0.55)',
         hoveredEdge: '#ff00b8',
         sideNodeFill: '#040812',
         sideNodeStroke: 'rgba(0, 255, 170, 0.45)',
         sideText: 'rgba(255, 255, 255, 0.75)',
         mainNodeFill: '#040812',
         mainNodeStroke: '#00b8ff',
         mainText: '#ffffff',
         activePath: 'rgba(0, 255, 170, 0.65)',
         pulseFill: '#ffffff',
         pulseShadow: '#00ffaa'
    };

    // Helper: Draw single edge path (straight or curved)
    const traceEdge = (edge: {source: Node, target: Node}) => {
      const x1 = edge.source.x;
      const y1 = edge.source.y;
      const x2 = edge.target.x;
      const y2 = edge.target.y;

      if (propsRef.current.edgeStyle === 'curved') {
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        const dx = x2 - x1;
        const dy = y2 - y1;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        // Bend direction based on node ID to keep it deterministic
        const offset = dist * 0.12 * (edge.target.id % 2 === 0 ? 1 : -1);
        const len = Math.sqrt(dx * dx + dy * dy);
        const nx = -dy / (len || 1);
        const ny = dx / (len || 1);
        const cx = mx + nx * offset;
        const cy = my + ny * offset;

        ctx.moveTo(x1, y1);
        ctx.quadraticCurveTo(cx, cy, x2, y2);
      } else {
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
      }
    };

    // 1. Draw SIDE EDGES
    ctx.beginPath();
    for (const edge of edges.current) {
      if (!edge.isMain) {
        if (!isVisible(edge.source.x, edge.source.y) && !isVisible(edge.target.x, edge.target.y)) continue;
        traceEdge(edge);
      }
    }
    ctx.strokeStyle = colors.sideEdge;
    ctx.lineWidth = 1.6 / t.k;
    ctx.stroke();
    
    // 2. Draw MAIN PATH EDGES
    ctx.beginPath();
    for (const edge of edges.current) {
      if (edge.isMain) {
        if (!isVisible(edge.source.x, edge.source.y) && !isVisible(edge.target.x, edge.target.y)) continue;
        traceEdge(edge);
      }
    }
    ctx.strokeStyle = colors.mainEdge;
    ctx.lineWidth = 3.2 / t.k;
    ctx.stroke();

    // 3. Draw HOVERED EDGES
    if (hoveredNode) {
      ctx.beginPath();
      for (const edge of edges.current) {
        const isHovered = hoveredPathSetRef.current.has(edge.source.id) && hoveredPathSetRef.current.has(edge.target.id);
        if (isHovered) {
          traceEdge(edge);
        }
      }
      ctx.save();
      ctx.strokeStyle = colors.hoveredEdge;
      ctx.lineWidth = 4.5 / t.k;
      ctx.shadowColor = colors.hoveredEdge;
      ctx.shadowBlur = 10 / t.k;
      ctx.stroke();
      ctx.restore();
    }

    // 4. Draw SIDE NODES
    ctx.beginPath();
    for (const node of nodesMap.current.values()) {
      if (!node.isMainPath && isVisible(node.x, node.y)) {
        const isHovered = hoveredNode?.id === node.id || hoveredPathSetRef.current.has(node.id);
        const r = isHovered ? 12 : 9.5;
        ctx.moveTo(node.x + r, node.y);
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
      }
    }
    ctx.fillStyle = colors.sideNodeFill;
    ctx.fill();
    ctx.lineWidth = 1.8 / t.k;
    ctx.strokeStyle = colors.sideNodeStroke;
    ctx.stroke();

    // 5. Draw SIDE NODE TEXT (only when zoomed in)
    if (t.k > 0.8) {
      ctx.fillStyle = colors.sideText;
      ctx.font = `600 ${8.5}px 'Outfit', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const node of nodesMap.current.values()) {
        if (!node.isMainPath && isVisible(node.x, node.y)) {
          ctx.fillText(node.id.toString(), node.x, node.y);
        }
      }
    }

    // 6. Draw MAIN NODES
    ctx.beginPath();
    for (const node of nodesMap.current.values()) {
      if (node.isMainPath && isVisible(node.x, node.y)) {
        const isHovered = hoveredNode?.id === node.id || hoveredPathSetRef.current.has(node.id);
        const r = isHovered ? 18.5 : 15.5;
        ctx.moveTo(node.x + r, node.y);
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
      }
    }
    ctx.fillStyle = colors.mainNodeFill;
    ctx.fill();
    ctx.lineWidth = 2.4 / t.k;
    ctx.strokeStyle = colors.mainNodeStroke;
    ctx.stroke();

    // 7. Draw MAIN NODE TEXT
    ctx.fillStyle = colors.mainText;
    ctx.font = `700 ${11.5}px 'Outfit', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const node of nodesMap.current.values()) {
      if (node.isMainPath && isVisible(node.x, node.y)) {
        ctx.fillText(node.id.toString(), node.x, node.y);
      }
    }

    // 8. Draw active descent path & pulse
    const active = activePathRef.current;
    if (active && active.nodes.length > 0) {
      const nodes = active.nodes;
      
      // Highlight the path being traveled
      ctx.beginPath();
      for (let i = 0; i < nodes.length - 1; i++) {
        traceEdge({ source: nodes[i], target: nodes[i + 1] });
      }
      ctx.strokeStyle = colors.activePath;
      ctx.lineWidth = 5 / t.k;
      ctx.stroke();
      
      const targetIdx = Math.floor(active.progress);
      if (targetIdx < nodes.length - 1) {
        const n1 = nodes[targetIdx];
        const n2 = nodes[targetIdx + 1];
        const subProgress = active.progress - targetIdx;
        
        let px = n1.x + (n2.x - n1.x) * subProgress;
        let py = n1.y + (n2.y - n1.y) * subProgress;

        // Trace the exact curved line if layout is curved
        if (propsRef.current.edgeStyle === 'curved') {
          const mx = (n1.x + n2.x) / 2;
          const my = (n1.y + n2.y) / 2;
          const dx = n2.x - n1.x;
          const dy = n2.y - n1.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const offset = dist * 0.12 * (n2.id % 2 === 0 ? 1 : -1);
          const len = Math.sqrt(dx*dx + dy*dy);
          const nx = -dy / (len || 1);
          const ny = dx / (len || 1);
          const cx = mx + nx * offset;
          const cy = my + ny * offset;

          const [cpx, cpy] = getPointOnCurve(n1.x, n1.y, cx, cy, n2.x, n2.y, subProgress);
          px = cpx;
          py = cpy;
        }
        
        // Spark particles wake
        if (!propsRef.current.isPaused && Math.random() < 0.6) {
          particlesRef.current.push({
            x: px,
            y: py,
            vx: (Math.random() - 0.5) * 1.6,
            vy: (Math.random() - 0.5) * 1.6,
            alpha: 1.0,
            size: Math.random() * 2.8 + 1.2,
            color: propsRef.current.palette === 'light' ? '#0064c8' : '#00ffaa'
          });
        }

        // Draw traveling comet pulse
        ctx.save();
        ctx.beginPath();
        ctx.arc(px, py, 7 / t.k, 0, Math.PI * 2);
        ctx.fillStyle = colors.pulseFill;
        ctx.shadowColor = colors.pulseShadow;
        ctx.shadowBlur = 24 / t.k;
        ctx.fill();
        ctx.restore();

        // Center camera to follow descent
        const targetK = 1.45;
        cameraTargetRef.current = {
          x: width / 2 - px * targetK,
          y: height * 0.5 - py * targetK,
          k: targetK
        };
      }

      if (!propsRef.current.isPaused) {
        const baseSpeed = [0.45, 0.22, 0.08, 0.024, 0.007][propsRef.current.speed - 1] || 0.08;
        active.progress += baseSpeed * (dt / 16.6);
        if (active.progress >= nodes.length - 1) {
           active.progress = nodes.length - 1;
        }
      }
    }

    // 9. Draw / Update active particles
    ctx.save();
    for (let i = particlesRef.current.length - 1; i >= 0; i--) {
      const p = particlesRef.current[i];
      p.x += p.vx * (dt / 16.6);
      p.y += p.vy * (dt / 16.6);
      p.alpha -= 0.026 * (dt / 16.6);
      if (p.alpha <= 0) {
        particlesRef.current.splice(i, 1);
        continue;
      }
      
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    ctx.restore();
    animationRef.current = requestAnimationFrame(draw);
  };

  useImperativeHandle(ref, () => ({
    buildTree: (seed: number, onComplete: () => void) => {
      if (activeTaskRef.current.timeoutId) {
        window.clearTimeout(activeTaskRef.current.timeoutId);
      }
      activeTaskRef.current.isRunning = true;
      setIsAnimating(true);
      
      initSingleNode();
      
      let current = seed;
      const pathSeq: number[] = [];
      while (current > 1) {
        pathSeq.push(current);
        current = current % 2 === 0 ? current / 2 : current * 3 + 1;
      }
      pathSeq.push(1);
      pathSeq.reverse(); // [1, ..., seed]

      let step = 1;
      let branchTips: Node[] = [];
      let isMainBuilt = false;

      const svg = d3.select(canvasRef.current);
      const zoom = d3.zoom<HTMLCanvasElement, unknown>()
        .scaleExtent([0.05, 15])
        .on('zoom', (e) => {
          transformRef.current = e.transform;
        });
      svg.call(zoom as any);

      // Set side branch growth limit based on Density
      const densVal = propsRef.current.density;
      const targetNodes = densVal === 'low' 
        ? Math.min(300, pathSeq.length * 6)
        : densVal === 'medium' 
          ? Math.min(2200, pathSeq.length * 35)
          : Math.min(12000, pathSeq.length * 120);

      const branchProb = densVal === 'low' ? 0.12 : densVal === 'medium' ? 0.28 : 0.45;

      const nextStep = () => {
        if (!activeTaskRef.current.isRunning) return;
        
        if (step >= pathSeq.length && !isMainBuilt) {
          isMainBuilt = true;
          setIsAnimating(false);
          
          // Instantly grow secondary branches fully
          let panic = 0;
          while (branchTips.length > 0 && nodesMap.current.size < targetNodes && panic < 180) {
              let newTips: Node[] = [];
              for (const tip of branchTips) {
                  if (nodesMap.current.size > targetNodes) break;
                  
                  const t1 = tip.id * 2;
                  const t2 = (tip.id - 1) / 3;
                  
                  let pushed = false;
                  if (!nodesMap.current.has(t1)) {
                      if (Math.random() < 0.75) {
                          const n1 = addNode(t1, tip, false);
                          newTips.push(n1);
                          pushed = true;
                      } else {
                          newTips.push(tip);
                          pushed = true;
                      }
                  }
                  if (tip.id > 4 && (tip.id - 1) % 3 === 0) {
                      if (t2 % 2 !== 0 && t2 > 1 && !nodesMap.current.has(t2)) {
                          if (Math.random() < 0.85) {
                              const n2 = addNode(t2, tip, false);
                              newTips.push(n2);
                          } else if (!pushed) {
                              newTips.push(tip);
                          }
                      }
                  }
              }
              if (newTips.length > 180) {
                  newTips = newTips.sort(() => Math.random() - 0.5).slice(0, 110);
              }
              branchTips = newTips;
              panic++;
          }
          
          recalculateLayout();
          onComplete();
        }

        if (step < pathSeq.length) {
          const val = pathSeq[step];
          const prevVal = pathSeq[step - 1];
          const parent = nodesMap.current.get(prevVal)!;
          
          const node = addNode(val, parent, true);
          
          const c1 = node.id * 2;
          const c2 = (node.id - 1) / 3;
          
          if (!nodesMap.current.has(c1) && Math.random() < branchProb) {
             branchTips.push(node);
          }
          if (node.id > 4 && (node.id - 1) % 3 === 0 && !nodesMap.current.has(c2)) {
             branchTips.push(node);
          }

          const canvas = canvasRef.current;
          if (canvas) {
            const width = canvas.width;
            const height = canvas.height;
            const k = 1.15; 
            cameraTargetRef.current = {
              x: width / 2 - node.x * k,
              y: height * 0.4 - node.y * k,
              k: k
            };
          }
        }

        // Sprout side-branches alongside main path
        if (nodesMap.current.size < targetNodes) {
          let newTips: Node[] = [];
          for (const tip of branchTips) {
              if (nodesMap.current.size > targetNodes) break;
              
              const t1 = tip.id * 2;
              const t2 = (tip.id - 1) / 3;
              
              let pushed = false;
              if (!nodesMap.current.has(t1)) {
                  if (Math.random() < 0.78) {
                      const n1 = addNode(t1, tip, false);
                      newTips.push(n1);
                      pushed = true;
                  } else {
                      newTips.push(tip);
                      pushed = true;
                  }
              }
              if (tip.id > 4 && (tip.id - 1) % 3 === 0) {
                  if (t2 % 2 !== 0 && t2 > 1 && !nodesMap.current.has(t2)) {
                      if (Math.random() < 0.88) {
                          const n2 = addNode(t2, tip, false);
                          newTips.push(n2);
                      } else if (!pushed) {
                          newTips.push(tip);
                      }
                  }
              }
          }
          if (newTips.length > 150) {
              newTips = newTips.sort(() => Math.random() - 0.5).slice(0, 100);
          }
          branchTips = newTips;
        }

        recalculateLayout();
        step++;
        
        if (step <= pathSeq.length) {
           activeTaskRef.current.timeoutId = window.setTimeout(nextStep, 250);
        } else {
           activeTaskRef.current.isRunning = false;
        }
      };

      const canvas = canvasRef.current;
      if (canvas) {
        cameraTargetRef.current = {
           x: canvas.width / 2,
           y: canvas.height * 0.4,
           k: 1.15
        };
      }

      activeTaskRef.current.timeoutId = window.setTimeout(nextStep, 300);
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

      activePathRef.current = {
        nodes: fullPath,
        progress: 0
      };
    },
    setExploreMode: (explore: boolean) => {
      isExploreModeRef.current = explore;
    },
    focusOnNode: (id: number) => {
      const node = nodesMap.current.get(id);
      if (node && canvasRef.current) {
        const canvas = canvasRef.current;
        const targetK = Math.min(2.5, 1.8);
        cameraTargetRef.current = {
          x: canvas.width / 2 - node.x * targetK,
          y: canvas.height * 0.5 - node.y * targetK,
          k: targetK
        };
        setHoveredNode(node);
      }
    },
    recalculateLayout: () => {
      recalculateLayout();
    }
  }));

  useEffect(() => {
    initSingleNode();

    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resize = () => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    };
    
    window.addEventListener('resize', resize);
    resize();

    const zoom = d3.zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.05, 15])
      .on('zoom', (e) => {
        transformRef.current = e.transform;
      });

    d3.select(canvas).call(zoom as any);
    
    const initialTransform = d3.zoomIdentity.translate(canvas.width / 2, canvas.height * 0.85);
    transformRef.current = initialTransform;
    (canvas as any).__zoom = initialTransform;

    cameraTargetRef.current = {
       x: canvas.width / 2,
       y: canvas.height * 0.45,
       k: 1.1
    };

    // Node hovering & selection on canvas click
    let startX = 0;
    let startY = 0;

    const handleMouseMove = (e: MouseEvent) => {
      const canvasNode = canvasRef.current;
      if (!canvasNode) return;
      const rect = canvasNode.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      const [tx, ty] = transformRef.current.invert([mouseX, mouseY]);
      
      let closestNode: Node | null = null;
      let minDistance = 22; // pixels hover threshold
      
      for (const node of nodesMap.current.values()) {
        const dx = node.x - tx;
        const dy = node.y - ty;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDistance) {
          minDistance = dist;
          closestNode = node;
        }
      }
      
      setHoveredNode(prev => prev?.id !== closestNode?.id ? closestNode : prev);
    };

    const handleMouseDown = (e: MouseEvent) => {
      startX = e.clientX;
      startY = e.clientY;
    };

    const handleMouseUp = (e: MouseEvent) => {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist < 4) { // registers click only if mouse didn't drag
        const canvasNode = canvasRef.current;
        if (!canvasNode) return;
        const rect = canvasNode.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const [tx, ty] = transformRef.current.invert([mouseX, mouseY]);
        
        let closestNode: Node | null = null;
        let minDistance = 22;
        
        for (const node of nodesMap.current.values()) {
          const dx = node.x - tx;
          const dy = node.y - ty;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < minDistance) {
            minDistance = dist;
            closestNode = node;
          }
        }
        
        if (closestNode && propsRef.current.onSelectNode) {
          propsRef.current.onSelectNode(closestNode.id);
        }
      }
    };

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mouseup', handleMouseUp);

    animationRef.current = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener('resize', resize);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (activeTaskRef.current.timeoutId) window.clearTimeout(activeTaskRef.current.timeoutId);
      
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mouseup', handleMouseUp);
      
      stopForceSimulation();
    };
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
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
      
      {isAnimating && (
        <div className="growing-indicator">
          computing...
        </div>
      )}

      {/* glassmorphic interactive tooltip */}
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
            click to use as seed
          </div>
        </div>
      )}
    </div>
  );
});

CollatzTree.displayName = 'CollatzTree';

export default CollatzTree;

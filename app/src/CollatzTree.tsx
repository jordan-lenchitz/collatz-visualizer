import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import * as d3 from 'd3';

export interface CollatzTreeRef {
  buildTree: (seed: number, onComplete: () => void) => void;
  followPathDown: (seed: number) => void;
  setExploreMode: (explore: boolean) => void;
  focusOnNode: (id: number) => void;
  recalculateLayout: () => void;
  stopBuilding: () => void;
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
  layoutX?: number;
  layoutY?: number;
  weight?: number;
}

interface CollatzTreeProps {
  speed: number;
  isPaused: boolean;
  palette: 'dark' | 'light';

  edgeStyle: 'curved' | 'straight';
  density: 'low' | 'medium' | 'high';
  hoveredNodeId: number | null;
  onHoverNode: (id: number | null) => void;
  onSelectNode: (id: number) => void;
  onRequestSeed?: (id: number) => void;
  onPathComplete?: () => void;
}

const CollatzTree = forwardRef<CollatzTreeRef, CollatzTreeProps>((props, ref) => {
  const propsRef = useRef(props);
  useEffect(() => {
    propsRef.current = props;
  }, [props]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const a11yContainerRef = useRef<HTMLDivElement>(null);
  
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

  // Perfect mathematical tree layout using d3.tree
  const computePalmLayout = (nodes: Map<number, Node>) => {
    const childrenOf = new Map<number, number[]>();
    for (const node of nodes.values()) {
      if (node.parent !== null) {
        if (!childrenOf.has(node.parent)) childrenOf.set(node.parent, []);
        childrenOf.get(node.parent)!.push(node.id);
      }
    }

    const buildHierarchy = (id: number): any => {
      const node = nodes.get(id);
      if (!node) return null;
      const children = childrenOf.get(id) || [];
      return {
        id,
        node,
        children: children.map(buildHierarchy).filter(Boolean)
      };
    };

    const rootData = buildHierarchy(1);
    if (!rootData) return;

    const root = d3.hierarchy(rootData);
    
    // Calculate node size dynamically based on density - increased for more spacing
    const dx = propsRef.current.density === 'high' ? 45 : 70;
    const dy = propsRef.current.density === 'high' ? 75 : 110;
    
    const treeLayout = d3.tree().nodeSize([dx, dy]);
    treeLayout(root);

    root.each((d: any) => {
      const n = d.data.node as Node;
      n.layoutX = d.x;
      n.layoutY = -d.y; // Invert Y to grow upwards
      
      if (n.parent) {
         n.angle = -Math.PI / 2; // Keep edges somewhat straight for styling
      } else {
         n.angle = -Math.PI / 2;
      }
    });
  };



  const recalculateLayout = () => {
    const nodes = nodesMap.current;
    if (nodes.size === 0) return;

    computePalmLayout(nodes);
    
    stopForceSimulation(); // Make absolutely sure physics is dead

    // Assign targets so the tree gracefully animates into its perfect mathematical shape
    for (const node of nodes.values()) {
        node.targetX = node.layoutX || 0;
        node.targetY = node.layoutY || 0;
    }
  };

  // Recalculate when props change
  useEffect(() => {
    recalculateLayout();
  }, [props.density]);

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
      targetY: 0,
      layoutX: 0,
      layoutY: 0
    });
    
    if (a11yContainerRef.current) {
      a11yContainerRef.current.innerHTML = '';
      const btn = document.createElement('button');
      btn.className = 'sr-only';
      btn.textContent = `Node 1, the end of the sequence. Press enter to use as seed.`;
      btn.onclick = () => { if (propsRef.current.onSelectNode) propsRef.current.onSelectNode(1); };
      
      const focusOnNodeLogic = (id: number) => {
        const n = nodesMap.current.get(id);
        if (n && canvasRef.current) {
          const targetK = Math.min(2.5, 1.8);
          cameraTargetRef.current = {
            x: canvasRef.current.width / 2 - n.x * targetK,
            y: canvasRef.current.height * 0.5 - n.y * targetK,
            k: targetK
          };
          setHoveredNode(n);
        }
      };
      
      btn.onfocus = () => focusOnNodeLogic(1);
      a11yContainerRef.current.appendChild(btn);
    }
  };

  const addNode = (val: number, parent: Node, isMainPath: boolean): Node => {
    // We spawn initially at parent x,y with a jitter, then let layout recalculation place them
    // This larger jitter (8.0 instead of 1.0) prevents d3 force simulation from exploding due to perfectly overlapping nodes
    const jitterX = (Math.random() - 0.5) * 8.0;
    const jitterY = (Math.random() - 0.5) * 8.0;
    const node: Node = {
      id: val,
      x: parent.x + jitterX,
      y: parent.y + jitterY,
      angle: parent.angle,
      parent: parent.id,
      depth: parent.depth + 1,
      isMainPath,
      targetX: parent.x + jitterX,
      targetY: parent.y + jitterY,
      layoutX: parent.layoutX || 0,
      layoutY: parent.layoutY || 0
    };
    
    nodesMap.current.set(val, node);
    edges.current.push({ source: parent, target: node, isMain: isMainPath });
    
    if (a11yContainerRef.current && nodesMap.current.size <= 2000) {
      const btn = document.createElement('button');
      btn.className = 'sr-only';
      btn.textContent = `Node ${val}, ${val % 2 === 0 ? 'even' : 'odd'}, ${node.depth} steps to one. Press enter to use as seed.`;
      btn.onclick = () => { if (propsRef.current.onSelectNode) propsRef.current.onSelectNode(val); };
      
      const focusOnNodeLogic = (id: number) => {
        const n = nodesMap.current.get(id);
        if (n && canvasRef.current) {
          const targetK = Math.min(2.5, 1.8);
          cameraTargetRef.current = {
            x: canvasRef.current.width / 2 - n.x * targetK,
            y: canvasRef.current.height * 0.5 - n.y * targetK,
            k: targetK
          };
          setHoveredNode(n);
        }
      };
      
      btn.onfocus = () => focusOnNodeLogic(val);
      a11yContainerRef.current.appendChild(btn);
    }
    
    return node;
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

    // Emergency physics check inside draw loop
    if (simulationRef.current) {
      let unstable = false;
      for (const node of nodesMap.current.values() as any) {
        if (node.vx && node.vy && (node.vx * node.vx + node.vy * node.vy > 2500)) {
          unstable = true;
          break;
        }
      }
      if (unstable) {
        console.warn("Emergency stop triggered: Physics unstable during rendering.");
        stopForceSimulation();
      }
    }

    for (const node of nodesMap.current.values()) {
      if (simulationRef.current) {
         // simulation updates x/y towards layoutX/Y
      } else {
         // fallback if no sim
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
    
    // Dynamic color and styling helpers based on physics & math properties
    const getThemeColors = () => {
      return propsRef.current.palette === 'light' ? {
        pulseFill: '#0064c8',
        pulseShadow: '#00b8ff',
        activePath: 'rgba(0, 100, 200, 0.7)'
      } : {
        pulseFill: '#ffffff',
        pulseShadow: '#00ffaa',
        activePath: 'rgba(0, 255, 170, 0.65)'
      };
    };
    const theme = getThemeColors();

    const getNodeColor = (node: Node) => {
        // Create a real cascading rainbow
        // Hue circles the full 360 degrees as depth increases
        const baseHue = (node.depth * 15) % 360;
        // Shift odd nodes slightly so branches diverge in color
        const hue = (baseHue + (node.id % 2 === 0 ? 0 : 35)) % 360;
        
        // Gentler depth fade so clusters remain bright
        const depthRatio = Math.min(1, Math.max(0, 1 - node.depth / 120));
        
        if (propsRef.current.palette === 'dark') {
            if (node.isMainPath) return '#ffffff';
            // Boost base luminosity massively (60% base)
            const lum = 60 + 25 * depthRatio;
            return `hsl(${hue}, 100%, ${lum}%)`; // 100% saturation for full rainbow pop
        } else {
            if (node.isMainPath) return '#000000';
            const lum = 50 - 20 * depthRatio;
            return `hsl(${hue}, 95%, ${lum}%)`;
        }
    };

    const getEdgeColor = (edge: {source: Node, target: Node, isMain?: boolean}) => {
        if (edge.isMain) return propsRef.current.palette === 'dark' ? 'rgba(0, 240, 255, 0.95)' : 'rgba(0, 80, 220, 0.85)';
        const c = getNodeColor(edge.target);
        // Boost side edge alpha to 0.55
        return c.replace(')', ', 0.55)').replace('hsl', 'hsla');
    };

    const getNodeRadius = (node: Node, isHovered: boolean) => {
        const baseR = 5.0 + Math.log10(node.id) * 3.5 + Math.log10(node.weight || 1) * 2.0;
        const size = node.isMainPath ? baseR * 1.3 : baseR;
        return isHovered ? size * 1.4 : size;
    };

    const getEdgeWidth = (edge: {source: Node, target: Node, isMain?: boolean}) => {
        const w = 0.5 + Math.log10(edge.target.weight || 1) * 1.5;
        return edge.isMain ? w * 2.5 : w;
    };

    const getDepthAlpha = (node: Node) => {
        // High base alpha so side clusters don't disappear
        return Math.max(0.65, 1 - (node.depth / 100));
    };

    // Helper: Draw single edge path (straight or curved)
    const traceEdge = (edge: {source: Node, target: Node, isMain?: boolean}) => {
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
        
        // Bend severity proportional to the math leap!
        // Reduced severity for a more elegant, taut look without excessive concavity
        const isEvenStep = edge.target.id === edge.source.id * 2;
        const severity = isEvenStep ? 0.02 : 0.12;
        const offset = dist * severity * (edge.target.id % 2 === 0 ? 1 : -1);
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

    ctx.save();
    // Additive blending for that glorious cosmic nebula look where dense branches overlap
    if (propsRef.current.palette === 'dark') {
      ctx.globalCompositeOperation = 'lighter';
    } else {
      ctx.globalCompositeOperation = 'multiply';
    }

    // 1. Draw SIDE EDGES
    for (const edge of edges.current) {
      if (!edge.isMain) {
        if (!isVisible(edge.source.x, edge.source.y) && !isVisible(edge.target.x, edge.target.y)) continue;
        ctx.beginPath();
        traceEdge(edge);
        ctx.strokeStyle = getEdgeColor(edge);
        ctx.lineWidth = getEdgeWidth(edge) / t.k;
        ctx.globalAlpha = getDepthAlpha(edge.target);
        ctx.stroke();
      }
    }
    
    // 2. Draw MAIN PATH EDGES
    ctx.globalAlpha = 1.0;
    for (const edge of edges.current) {
      if (edge.isMain) {
        if (!isVisible(edge.source.x, edge.source.y) && !isVisible(edge.target.x, edge.target.y)) continue;
        ctx.beginPath();
        traceEdge(edge);
        ctx.strokeStyle = getEdgeColor(edge);
        ctx.lineWidth = getEdgeWidth(edge) / t.k;
        ctx.stroke();
      }
    }
    
    ctx.restore(); // Restore default composite mode before drawing solid nodes

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
      ctx.strokeStyle = propsRef.current.palette === 'dark' ? '#ff00b8' : '#d80073';
      ctx.lineWidth = 4.5 / t.k;
      ctx.shadowColor = propsRef.current.palette === 'dark' ? '#ff00b8' : '#d80073';
      ctx.shadowBlur = 10 / t.k;
      ctx.stroke();
      ctx.restore();
    }

    const active = activePathRef.current;
    if (active && active.nodes.length > 0) {
      const nodes = active.nodes;
      
      const currentIdx = Math.floor(active.progress);
      
      // Highlight the path being traveled (from 0 up to current progress)
      ctx.beginPath();
      for (let i = 0; i < Math.min(currentIdx, nodes.length - 1); i++) {
        traceEdge({ source: nodes[i], target: nodes[i + 1] });
      }
      ctx.strokeStyle = theme.activePath;
      ctx.lineWidth = 5 / t.k;
      ctx.stroke();
      
      // Leave brighter marks on the edge of all nodes we've visited so far!
      for (let i = 0; i <= currentIdx && i < nodes.length; i++) {
         const n = nodes[i];
         ctx.beginPath();
         // Slightly larger radius than the base node to form a glowing ring
         const r = getNodeRadius(n, false) + 1.5 / t.k; 
         ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
         ctx.strokeStyle = theme.pulseFill; 
         ctx.lineWidth = 1.5 / t.k;
         ctx.stroke();
      }
      
      if (currentIdx < nodes.length) {
        const currentNode = nodes[currentIdx];
        
        // Spark particles wake at the current node (reduced probability and size for less dust)
        if (!propsRef.current.isPaused && Math.random() < 0.15) {
          particlesRef.current.push({
            x: currentNode.x,
            y: currentNode.y,
            vx: (Math.random() - 0.5) * 0.8,
            vy: (Math.random() - 0.5) * 0.8,
            alpha: 1.0,
            size: Math.random() * 1.5 + 0.5,
            color: theme.pulseFill
          });
        }

        // Draw traveling comet pulse exactly on the edge of the teleported node
        ctx.save();
        ctx.beginPath();
        const r = getNodeRadius(currentNode, false) + 2.5 / t.k;
        ctx.arc(currentNode.x, currentNode.y, r, 0, Math.PI * 2);
        ctx.strokeStyle = theme.pulseFill;
        ctx.lineWidth = 2.0 / t.k;
        ctx.shadowColor = theme.pulseShadow;
        ctx.shadowBlur = 10 / t.k;
        ctx.stroke();
        ctx.restore();

        // Center camera to follow teleportation
        const targetK = 1.45;
        cameraTargetRef.current = {
          x: width / 2 - currentNode.x * targetK,
          y: height * 0.5 - currentNode.y * targetK,
          k: targetK
        };
      }

      if (!propsRef.current.isPaused) {
        // We use the same base speed but multiplied because discrete looks slower than continuous
        const baseSpeed = [0.035, 0.015, 0.006, 0.002, 0.0005][propsRef.current.speed - 1] || 0.006;
        const wasComplete = active.progress >= nodes.length - 1;
        active.progress += baseSpeed * (dt / 16.6) * 1.8;
        if (active.progress >= nodes.length - 1) {
           active.progress = nodes.length - 1;
           if (!wasComplete && propsRef.current.onPathComplete) {
               propsRef.current.onPathComplete();
           }
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

    // 4. Draw SIDE NODES
    for (const node of nodesMap.current.values()) {
      if (!node.isMainPath && isVisible(node.x, node.y)) {
        ctx.beginPath();
        const isHovered = hoveredNode?.id === node.id || hoveredPathSetRef.current.has(node.id);
        const r = getNodeRadius(node, isHovered);
        ctx.moveTo(node.x + r, node.y);
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        
        ctx.fillStyle = propsRef.current.palette === 'dark' ? '#040812' : '#ffffff';
        ctx.globalAlpha = getDepthAlpha(node);
        ctx.fill();
        
        ctx.lineWidth = 1.8 / t.k;
        ctx.strokeStyle = getNodeColor(node);
        ctx.stroke();
      }
    }

    // 5. Draw SIDE NODE TEXT (only when zoomed in)
    if (t.k > 0.8) {
      ctx.font = `600 ${6.5}px 'Outfit', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const node of nodesMap.current.values()) {
        if (!node.isMainPath && isVisible(node.x, node.y)) {
          ctx.globalAlpha = getDepthAlpha(node);
          ctx.fillStyle = propsRef.current.palette === 'dark' ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.75)';
          ctx.fillText(node.id.toString(), node.x, node.y);
        }
      }
    }

    // 6. Draw MAIN NODES
    ctx.globalAlpha = 1.0;
    for (const node of nodesMap.current.values()) {
      if (node.isMainPath && isVisible(node.x, node.y)) {
        ctx.beginPath();
        const isHovered = hoveredNode?.id === node.id || hoveredPathSetRef.current.has(node.id);
        const r = getNodeRadius(node, isHovered);
        ctx.moveTo(node.x + r, node.y);
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        
        ctx.fillStyle = propsRef.current.palette === 'dark' ? '#040812' : '#ffffff';
        ctx.fill();
        
        ctx.lineWidth = 2.8 / t.k;
        ctx.strokeStyle = getNodeColor(node);
        ctx.stroke();
      }
    }

    // 7. Draw MAIN NODE TEXT
    ctx.font = `700 ${9}px 'Outfit', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const node of nodesMap.current.values()) {
      if (node.isMainPath && isVisible(node.x, node.y)) {
        ctx.fillStyle = propsRef.current.palette === 'dark' ? '#ffffff' : '#000000';
        ctx.fillText(node.id.toString(), node.x, node.y);
      }
    }

    // 8. Draw active descent path & teleport pulse
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
      
      // Let the browser paint the cleared screen before we freeze it with heavy computation
      activeTaskRef.current.timeoutId = window.setTimeout(() => {
        let current = seed;
      const pathSeq: number[] = [];
      while (current > 1) {
        pathSeq.push(current);
        current = current % 2 === 0 ? current / 2 : current * 3 + 1;
      }
      pathSeq.push(1);
      pathSeq.reverse(); // [1, ..., seed]

      let branchTips: Node[] = [];

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
          ? Math.min(1000, pathSeq.length * 20)
          : Math.min(2000, pathSeq.length * 40);

      const branchProb = densVal === 'low' ? 0.12 : densVal === 'medium' ? 0.28 : 0.45;

      // 1. Synchronously build main path
      for (let step = 1; step < pathSeq.length; step++) {
          const val = pathSeq[step];
          const prevVal = pathSeq[step - 1];
          const parent = nodesMap.current.get(prevVal)!;
          
          const node = addNode(val, parent, true);
          
          const c1 = node.id * 2;
          const c2 = (node.id - 1) / 3;
          
          if (!nodesMap.current.has(c1) && Math.random() < branchProb) branchTips.push(node);
          if (node.id > 4 && (node.id - 1) % 3 === 0 && !nodesMap.current.has(c2)) branchTips.push(node);
      }

      // 2. Synchronously sprout side branches
      let panic = 0;
      while (branchTips.length > 0 && nodesMap.current.size < targetNodes && panic < 250) {
          let newTips: Node[] = [];
          for (const tip of branchTips) {
              if (nodesMap.current.size > targetNodes) break;
              
              const t1 = tip.id * 2;
              const t2 = (tip.id - 1) / 3;
              
              let pushed = false;
              if (!nodesMap.current.has(t1)) {
                  if (Math.random() < 0.78) {
                      newTips.push(addNode(t1, tip, false));
                      pushed = true;
                  } else {
                      newTips.push(tip);
                      pushed = true;
                  }
              }
              if (tip.id > 4 && (tip.id - 1) % 3 === 0) {
                  if (t2 % 2 !== 0 && t2 > 1 && !nodesMap.current.has(t2)) {
                      if (Math.random() < 0.88) {
                          newTips.push(addNode(t2, tip, false));
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
          panic++;
      }

      // Calculate subtree weights for thickness/sizing
      const nodesArray = Array.from(nodesMap.current.values()).sort((a, b) => b.depth - a.depth);
      for (const node of nodesArray) {
        node.weight = 1;
      }
      for (const node of nodesArray) {
        if (node.parent !== null) {
          const p = nodesMap.current.get(node.parent);
          if (p) {
            p.weight = (p.weight || 0) + (node.weight || 1);
          }
        }
      }

      // 3. Pre-calculate layout & instantiate forces
      recalculateLayout();

      // 4. Fast-forward the physics simulation so it instantly settles! (NO MORE ANGRY BEES)
      if (simulationRef.current) {
          simulationRef.current.tick(120);
          
          // Force apply layout targets instantly to skip transition
          for (const node of nodesMap.current.values()) {
              node.targetX = node.x;
              node.targetY = node.y;
          }
      }

      // Center Camera on seed
      const canvas = canvasRef.current;
      if (canvas) {
          const seedNode = nodesMap.current.get(seed);
          const k = 1.15;
          cameraTargetRef.current = {
             x: canvas.width / 2 - (seedNode ? seedNode.x * k : 0),
             y: canvas.height * 0.4 - (seedNode ? seedNode.y * k : 0),
             k: k
          };
      }

        activeTaskRef.current.isRunning = false;
        setIsAnimating(false);
        onComplete();
      }, 50);
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
    },
    stopBuilding: () => {
      if (activeTaskRef.current.timeoutId) {
        window.clearTimeout(activeTaskRef.current.timeoutId);
        activeTaskRef.current.timeoutId = undefined;
      }
      activeTaskRef.current.isRunning = false;
      setIsAnimating(false);
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

    d3.select(canvas).call(zoom as any).on("dblclick.zoom", null);
    
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
    let longPressTimer: ReturnType<typeof setTimeout> | null = null;
    
    const clearLongPress = () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      const canvasNode = canvasRef.current;
      if (!canvasNode) return;
      const rect = canvasNode.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 10) {
        clearLongPress();
      }
      
      const [tx, ty] = transformRef.current.invert([mouseX, mouseY]);
      
      let closestNode: Node | null = null;
      let minDistance = 22; // pixels hover threshold
      
      for (const node of nodesMap.current.values()) {
        const dxNode = node.x - tx;
        const dyNode = node.y - ty;
        const distNode = Math.sqrt(dxNode * dxNode + dyNode * dyNode);
        if (distNode < minDistance) {
          minDistance = distNode;
          closestNode = node;
        }
      }
      
      setHoveredNode(prev => prev?.id !== closestNode?.id ? closestNode : prev);
    };

    const handleMouseDown = (e: MouseEvent) => {
      startX = e.clientX;
      startY = e.clientY;
      
      const canvasNode = canvasRef.current;
      if (!canvasNode) return;
      const rect = canvasNode.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const [tx, ty] = transformRef.current.invert([mouseX, mouseY]);
      
      let closestNode: Node | null = null;
      let minDistance = 22;
      
      for (const node of nodesMap.current.values()) {
        const dxNode = node.x - tx;
        const dyNode = node.y - ty;
        const distToNode = Math.sqrt(dxNode * dxNode + dyNode * dyNode);
        if (distToNode < minDistance) {
          minDistance = distToNode;
          closestNode = node;
        }
      }
      
      if (closestNode) {
        longPressTimer = setTimeout(() => {
          if (propsRef.current.onRequestSeed) {
            propsRef.current.onRequestSeed(closestNode!.id);
          }
        }, 3000);
      }
    };

    const handleMouseUp = () => {
      clearLongPress();
    };

    const handleMouseLeave = () => {
      clearLongPress();
    };

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', handleMouseLeave);

    animationRef.current = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener('resize', resize);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (activeTaskRef.current.timeoutId) window.clearTimeout(activeTaskRef.current.timeoutId);
      
      clearLongPress();
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
      
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
      {/* Visually hidden container for screen reader and keyboard accessibility */}
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
            hold for 3s to use as seed
          </div>
        </div>
      )}
    </div>
  );
});

CollatzTree.displayName = 'CollatzTree';

export default CollatzTree;

import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import * as d3 from 'd3';

export interface CollatzTreeRef {
  buildTree: (seed: number, onComplete: () => void) => void;
  followPathDown: (seed: number) => void;
}

interface Node {
  id: number;
  x: number;
  y: number;
  angle: number;
  parent: number | null;
  depth: number;
  isMainPath: boolean;
}

const CollatzTree = forwardRef<CollatzTreeRef, {}>((_props, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const nodesMap = useRef<Map<number, Node>>(new Map());
  const edges = useRef<{source: Node, target: Node, isMain: boolean}[]>([]);
  
  const transformRef = useRef(d3.zoomIdentity);
  const cameraTargetRef = useRef<{x: number, y: number, k: number} | null>(null);
  const animationRef = useRef<number | undefined>(undefined);
  
  const activeTaskRef = useRef<{ timeoutId?: number, isRunning: boolean }>({ isRunning: false });
  const activePathRef = useRef<{ nodes: Node[], progress: number } | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);

  const initSingleNode = () => {
    nodesMap.current.clear();
    edges.current = [];
    activePathRef.current = null;
    cameraTargetRef.current = null;
    nodesMap.current.set(1, {
      id: 1,
      x: 0,
      y: 0,
      angle: -Math.PI / 2, // Upwards
      parent: null,
      depth: 0,
      isMainPath: true,
    });
  };

  const addNode = (val: number, parent: Node, isMainPath: boolean): Node => {
    let newAngle = parent.angle;
    if (val === parent.id * 2) {
      newAngle += 0.2 + (Math.random() * 0.1 - 0.05);
    } else {
      newAngle -= 0.6 + (Math.random() * 0.2 - 0.1);
    }

    const upAngle = -Math.PI / 2;
    let diff = upAngle - newAngle;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    newAngle += diff * 0.15;

    const currentLen = isMainPath ? 60 : 45;
    
    let x = parent.x + Math.cos(newAngle) * currentLen;
    let y = parent.y + Math.sin(newAngle) * currentLen;

    // Collision detection for non-main branches against main path
    if (!isMainPath) {
      const minDistance = 50; // Required distance from main nodes
      let attempts = 0;
      let collision = true;
      while (collision && attempts < 10) {
        collision = false;
        for (const n of nodesMap.current.values()) {
          if (n.isMainPath) {
            const dx = x - n.x;
            const dy = y - n.y;
            if (dx * dx + dy * dy < minDistance * minDistance) {
              collision = true;
              break;
            }
          }
        }
        if (collision) {
          // push the angle outwards away from center or random direction
          newAngle += (Math.random() > 0.5 ? 0.3 : -0.3);
          x = parent.x + Math.cos(newAngle) * currentLen;
          y = parent.y + Math.sin(newAngle) * currentLen;
          attempts++;
        }
      }
    }
    
    const node: Node = {
      id: val,
      x,
      y,
      angle: newAngle,
      parent: parent.id,
      depth: parent.depth + 1,
      isMainPath
    };
    
    nodesMap.current.set(val, node);
    edges.current.push({ source: parent, target: node, isMain: isMainPath });
    return node;
  };

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    
    // Camera follow logic
    if (cameraTargetRef.current) {
      const target = cameraTargetRef.current;
      const t = transformRef.current;
      
      const ease = 0.08;
      const newX = t.x + (target.x - t.x) * ease;
      const newY = t.y + (target.y - t.y) * ease;
      const newK = t.k + (target.k - t.k) * ease;
      
      transformRef.current = d3.zoomIdentity.translate(newX, newY).scale(newK);
      
      // Update D3's internal state to match so panning doesn't jump
      const selection = d3.select(canvas);
      if ((selection.node() as any).__zoom) {
         (selection.node() as any).__zoom = transformRef.current;
      }
    }

    ctx.clearRect(0, 0, width, height);
    
    ctx.save();
    
    const t = transformRef.current;
    ctx.translate(width / 2 + t.x, height * 0.8 + t.y);
    ctx.scale(t.k, t.k);

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    for (const edge of edges.current) {
      ctx.beginPath();
      ctx.moveTo(edge.source.x, edge.source.y);
      ctx.lineTo(edge.target.x, edge.target.y);
      if (edge.isMain) {
        ctx.strokeStyle = 'rgba(0, 184, 255, 0.8)';
        ctx.lineWidth = 3 / t.k;
      } else {
        ctx.strokeStyle = 'rgba(0, 255, 170, 0.4)';
        ctx.lineWidth = 1.5 / t.k;
      }
      ctx.stroke();
    }

    const active = activePathRef.current;
    if (active && active.nodes.length > 0) {
      const nodes = active.nodes;
      
      ctx.beginPath();
      ctx.moveTo(nodes[0].x, nodes[0].y);
      for(let i = 1; i < nodes.length; i++) {
        ctx.lineTo(nodes[i].x, nodes[i].y);
      }
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 4 / t.k;
      ctx.stroke();
      
      const targetIdx = Math.floor(active.progress);
      if (targetIdx < nodes.length - 1) {
        const n1 = nodes[targetIdx];
        const n2 = nodes[targetIdx + 1];
        const subProgress = active.progress - targetIdx;
        
        const px = n1.x + (n2.x - n1.x) * subProgress;
        const py = n1.y + (n2.y - n1.y) * subProgress;
        
        ctx.beginPath();
        ctx.arc(px, py, 6 / t.k, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#00ffaa';
        ctx.shadowBlur = 20 / t.k;
        ctx.fill();
        ctx.shadowBlur = 0;

        // Auto follow the light!
        const targetK = 1.5; // nice zoomed-in level for the light
        cameraTargetRef.current = {
          x: -px * targetK,
          y: -height * 0.3 - py * targetK, // Try to keep light somewhat near the bottom center
          k: targetK
        };
      }

      active.progress += 0.03; // slower pulse speed
      if (active.progress >= nodes.length - 1) {
         active.progress = nodes.length - 1;
      }
    }

    for (const node of nodesMap.current.values()) {
      const radius = node.isMainPath ? 16 : 10;
      
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = '#0a0a0a';
      ctx.fill();
      
      ctx.lineWidth = 2 / t.k;
      ctx.strokeStyle = node.isMainPath ? '#00b8ff' : 'rgba(0, 255, 170, 0.6)';
      ctx.stroke();

      ctx.fillStyle = node.isMainPath ? '#ffffff' : 'rgba(255, 255, 255, 0.7)';
      ctx.font = `${node.isMainPath ? 12 : 8}px 'Inter', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(node.id.toString(), node.x, node.y);
    }

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

      const svg = d3.select(canvasRef.current);
      const zoom = d3.zoom<HTMLCanvasElement, unknown>()
        .scaleExtent([0.1, 10])
        .on('zoom', (e) => {
          transformRef.current = e.transform;
          // Stop auto-following if the user manually zooms/pans during idle
          // but we won't disable it strictly here to allow smooth override
        });
      svg.call(zoom as any);

      const nextStep = () => {
        if (!activeTaskRef.current.isRunning) return;
        if (step >= pathSeq.length) {
          setIsAnimating(false);
          activeTaskRef.current.isRunning = false;
          onComplete();
          return;
        }

        const val = pathSeq[step];
        const prevVal = pathSeq[step - 1];
        const parent = nodesMap.current.get(prevVal)!;
        
        const node = addNode(val, parent, true);
        
        // Spawn initial branches from main path
        const c1 = node.id * 2;
        const c2 = (node.id - 1) / 3;
        
        if (!nodesMap.current.has(c1) && Math.random() < 0.4) {
           branchTips.push(node);
        }
        if (node.id > 4 && (node.id - 1) % 3 === 0 && !nodesMap.current.has(c2)) {
           branchTips.push(node);
        }

        // Advance all active side branches by one step alongside the main path
        let newTips: Node[] = [];
        for (const tip of branchTips) {
            if (nodesMap.current.size > 2000) break; // prevent lag
            
            const t1 = tip.id * 2;
            const t2 = (tip.id - 1) / 3;
            
            if (!nodesMap.current.has(t1) && Math.random() < 0.7) {
                const n1 = addNode(t1, tip, false);
                newTips.push(n1);
            }
            if (tip.id > 4 && (tip.id - 1) % 3 === 0) {
                if (t2 % 2 !== 0 && t2 > 1 && !nodesMap.current.has(t2) && Math.random() < 0.9) {
                    const n2 = addNode(t2, tip, false);
                    newTips.push(n2);
                }
            }
        }
        
        // Randomly cull some tips if we have too many so it doesn't explode
        if (newTips.length > 25) {
            newTips = newTips.sort(() => Math.random() - 0.5).slice(0, 20);
        }
        branchTips = newTips;

        // Auto follow the newest main path node
        const canvas = canvasRef.current;
        if (canvas) {
          const height = canvas.height;
          const k = 1.2; 
          cameraTargetRef.current = {
            x: -node.x * k,
            y: -height * 0.4 - node.y * k,
            k: k
          };
        }

        step++;
        activeTaskRef.current.timeoutId = window.setTimeout(nextStep, 250);
      };

      const canvas = canvasRef.current;
      if (canvas) {
        cameraTargetRef.current = {
           x: 0,
           y: -canvas.height * 0.4,
           k: 1.2
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

      // We just reset the target so the light can pick it up in draw()
      // cameraTargetRef will be set continuously in draw() during the pulse
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
      .scaleExtent([0.1, 10])
      .on('zoom', (e) => {
        transformRef.current = e.transform;
      });

    d3.select(canvas).call(zoom as any);
    
    // Initial camera position
    cameraTargetRef.current = {
       x: 0,
       y: -canvas.height * 0.4,
       k: 1.2
    };

    animationRef.current = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener('resize', resize);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (activeTaskRef.current.timeoutId) window.clearTimeout(activeTaskRef.current.timeoutId);
    };
  }, []);

  return (
    <div ref={containerRef} className="canvas-container" style={{ position: 'relative' }}>
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
      {isAnimating && (
        <div style={{
          position: 'absolute',
          bottom: '20px',
          left: '20px',
          color: '#00b8ff',
          fontFamily: 'monospace',
          fontSize: '14px',
          pointerEvents: 'none',
          textShadow: '0 0 8px rgba(0, 184, 255, 0.5)'
        }}>
          Climbing the tree...
        </div>
      )}
    </div>
  );
});

export default CollatzTree;

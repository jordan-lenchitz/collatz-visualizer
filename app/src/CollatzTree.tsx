import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import * as d3 from 'd3';

export interface CollatzTreeRef {
  buildTree: (seed: number, onComplete: () => void) => void;
  followPathDown: (seed: number) => void;
  setExploreMode: (explore: boolean) => void;
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

interface CollatzTreeProps {
  speed: number;
  isPaused: boolean;
  palette: 'dark' | 'light';
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
    
    // Calculate probability of branching right based on horizontal position
    // If far right (positive x), higher chance to branch left, ensuring eventual consistency
    let probRight = 0.5 - (parent.x / 1500);
    probRight = Math.max(0.1, Math.min(0.9, probRight)); // clamp between 0.1 and 0.9
    
    const dir = Math.random() < probRight ? 1 : -1;

    if (val === parent.id * 2) {
      newAngle += dir * (0.25 + Math.random() * 0.1);
    } else {
      // odd branches tend to shoot out the opposite way
      newAngle += (dir * -1) * (0.6 + Math.random() * 0.2);
    }

    const upAngle = -Math.PI / 2;
    let diff = upAngle - newAngle;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    newAngle += diff * 0.10;

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
      
      // Update D3's internal state to match so panning doesn't jump
      const selection = d3.select(canvas);
      if ((selection.node() as any).__zoom) {
         (selection.node() as any).__zoom = transformRef.current;
      }
    }

    ctx.clearRect(0, 0, width, height);
    
    ctx.save();
    
    const t = transformRef.current;
    ctx.translate(t.x, t.y);
    ctx.scale(t.k, t.k);

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    const minX = -t.x / t.k - 50;
    const maxX = (width - t.x) / t.k + 50;
    const minY = -t.y / t.k - 50;
    const maxY = (height - t.y) / t.k + 50;

    const isVisible = (x: number, y: number) => {
      return x >= minX && x <= maxX && y >= minY && y <= maxY;
    };
    
    const colors = propsRef.current.palette === 'light' ? {
         sideEdge: 'rgba(0, 150, 80, 0.4)',
         mainEdge: 'rgba(0, 100, 200, 0.8)',
         sideNodeFill: '#ffffff',
         sideNodeStroke: 'rgba(0, 150, 80, 0.6)',
         sideText: 'rgba(0, 0, 0, 0.7)',
         mainNodeFill: '#ffffff',
         mainNodeStroke: '#0064c8',
         mainText: '#000000',
         activePath: 'rgba(0, 0, 0, 0.5)',
         pulseFill: '#000000',
         pulseShadow: '#00cc66'
    } : {
         sideEdge: 'rgba(0, 255, 170, 0.4)',
         mainEdge: 'rgba(0, 184, 255, 0.8)',
         sideNodeFill: '#0a0a0a',
         sideNodeStroke: 'rgba(0, 255, 170, 0.6)',
         sideText: 'rgba(255, 255, 255, 0.7)',
         mainNodeFill: '#0a0a0a',
         mainNodeStroke: '#00b8ff',
         mainText: '#ffffff',
         activePath: 'rgba(255, 255, 255, 0.5)',
         pulseFill: '#ffffff',
         pulseShadow: '#00ffaa'
    };

    ctx.beginPath();
    for (const edge of edges.current) {
      if (!edge.isMain) {
        if (!isVisible(edge.source.x, edge.source.y) && !isVisible(edge.target.x, edge.target.y)) continue;
        ctx.moveTo(edge.source.x, edge.source.y);
        ctx.lineTo(edge.target.x, edge.target.y);
      }
    }
    ctx.strokeStyle = colors.sideEdge;
    ctx.lineWidth = 1.5 / t.k;
    ctx.stroke();
    
    ctx.beginPath();
    for (const edge of edges.current) {
      if (edge.isMain) {
        if (!isVisible(edge.source.x, edge.source.y) && !isVisible(edge.target.x, edge.target.y)) continue;
        ctx.moveTo(edge.source.x, edge.source.y);
        ctx.lineTo(edge.target.x, edge.target.y);
      }
    }
    ctx.strokeStyle = colors.mainEdge;
    ctx.lineWidth = 3 / t.k;
    ctx.stroke();

    ctx.beginPath();
    for (const node of nodesMap.current.values()) {
      if (!node.isMainPath && isVisible(node.x, node.y)) {
        ctx.moveTo(node.x + 10, node.y);
        ctx.arc(node.x, node.y, 10, 0, Math.PI * 2);
      }
    }
    ctx.fillStyle = colors.sideNodeFill;
    ctx.fill();
    ctx.lineWidth = 2 / t.k;
    ctx.strokeStyle = colors.sideNodeStroke;
    ctx.stroke();

    if (t.k > 0.8) {
      ctx.fillStyle = colors.sideText;
      ctx.font = `${8}px 'Inter', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const node of nodesMap.current.values()) {
        if (!node.isMainPath && isVisible(node.x, node.y)) {
          ctx.fillText(node.id.toString(), node.x, node.y);
        }
      }
    }

    ctx.beginPath();
    for (const node of nodesMap.current.values()) {
      if (node.isMainPath && isVisible(node.x, node.y)) {
        ctx.moveTo(node.x + 16, node.y);
        ctx.arc(node.x, node.y, 16, 0, Math.PI * 2);
      }
    }
    ctx.fillStyle = colors.mainNodeFill;
    ctx.fill();
    ctx.lineWidth = 2 / t.k;
    ctx.strokeStyle = colors.mainNodeStroke;
    ctx.stroke();

    ctx.fillStyle = colors.mainText;
    ctx.font = `${12}px 'Inter', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const node of nodesMap.current.values()) {
      if (node.isMainPath && isVisible(node.x, node.y)) {
        ctx.fillText(node.id.toString(), node.x, node.y);
      }
    }

    const active = activePathRef.current;
    if (active && active.nodes.length > 0) {
      const nodes = active.nodes;
      
      ctx.beginPath();
      ctx.moveTo(nodes[0].x, nodes[0].y);
      for(let i = 1; i < nodes.length; i++) {
        ctx.lineTo(nodes[i].x, nodes[i].y);
      }
      ctx.strokeStyle = colors.activePath;
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
        ctx.fillStyle = colors.pulseFill;
        ctx.shadowColor = colors.pulseShadow;
        ctx.shadowBlur = 20 / t.k;
        ctx.fill();
        ctx.shadowBlur = 0;

        // Auto follow the light!
        const targetK = 1.5; // nice zoomed-in level for the light
        cameraTargetRef.current = {
          x: width / 2 - px * targetK,
          y: height * 0.5 - py * targetK, // Try to keep light somewhat near the vertical center
          k: targetK
        };
      }

      if (!propsRef.current.isPaused) {
        const baseSpeed = [0.4, 0.15, 0.05, 0.015, 0.005][propsRef.current.speed - 1] || 0.05;
        // Normalize speed so it runs smoothly even if the frame rate drops
        active.progress += baseSpeed * (dt / 16.6);
        if (active.progress >= nodes.length - 1) {
           active.progress = nodes.length - 1;
        }
      }
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
      let isMainBuilt = false;

      const svg = d3.select(canvasRef.current);
      const zoom = d3.zoom<HTMLCanvasElement, unknown>()
        .scaleExtent([0.1, 10])
        .on('zoom', (e) => {
          transformRef.current = e.transform;
        });
      svg.call(zoom as any);

      const nextStep = () => {
        if (!activeTaskRef.current.isRunning) return;
        
        if (step >= pathSeq.length && !isMainBuilt) {
          isMainBuilt = true;
          setIsAnimating(false);
          
          // Instantly finish the arboreal growth so it's fully rendered for the light pulse
          const targetNodes = Math.min(12000, pathSeq.length * 100);
          let panic = 0;
          while (branchTips.length > 0 && nodesMap.current.size < targetNodes && panic < 200) {
              let newTips: Node[] = [];
              for (const tip of branchTips) {
                  if (nodesMap.current.size > targetNodes) break;
                  
                  const t1 = tip.id * 2;
                  const t2 = (tip.id - 1) / 3;
                  
                  let pushed = false;
                  if (!nodesMap.current.has(t1)) {
                      if (Math.random() < 0.8) {
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
                          if (Math.random() < 0.9) {
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
              panic++;
          }
          
          onComplete();
        }

        if (step < pathSeq.length) {
          const val = pathSeq[step];
          const prevVal = pathSeq[step - 1];
          const parent = nodesMap.current.get(prevVal)!;
          
          const node = addNode(val, parent, true);
          
          const c1 = node.id * 2;
          const c2 = (node.id - 1) / 3;
          
          if (!nodesMap.current.has(c1) && Math.random() < 0.4) {
             branchTips.push(node);
          }
          if (node.id > 4 && (node.id - 1) % 3 === 0 && !nodesMap.current.has(c2)) {
             branchTips.push(node);
          }

          const canvas = canvasRef.current;
          if (canvas) {
            const width = canvas.width;
            const height = canvas.height;
            const k = 1.2; 
            cameraTargetRef.current = {
              x: width / 2 - node.x * k,
              y: height * 0.4 - node.y * k,
              k: k
            };
          }
        }

        // Advance all active side branches by one step alongside the main path
        const dynamicMax = Math.min(12000, pathSeq.length * 100);
        if (nodesMap.current.size < dynamicMax) {
          let newTips: Node[] = [];
          for (const tip of branchTips) {
              if (nodesMap.current.size > dynamicMax) break; // prevent lag
              
              const t1 = tip.id * 2;
              const t2 = (tip.id - 1) / 3;
              
              let pushed = false;
              if (!nodesMap.current.has(t1)) {
                  if (Math.random() < 0.8) {
                      const n1 = addNode(t1, tip, false);
                      newTips.push(n1);
                      pushed = true;
                  } else {
                      newTips.push(tip); // keep tip alive to try again next frame
                      pushed = true;
                  }
              }
              if (tip.id > 4 && (tip.id - 1) % 3 === 0) {
                  if (t2 % 2 !== 0 && t2 > 1 && !nodesMap.current.has(t2)) {
                      if (Math.random() < 0.9) {
                          const n2 = addNode(t2, tip, false);
                          newTips.push(n2);
                      } else if (!pushed) {
                          newTips.push(tip);
                      }
                  }
              }
          }
          
          // Randomly cull some tips if we have too many so it doesn't explode
          if (newTips.length > 150) {
              newTips = newTips.sort(() => Math.random() - 0.5).slice(0, 100);
          }
          branchTips = newTips;
        }

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
    },
    setExploreMode: (explore: boolean) => {
      isExploreModeRef.current = explore;
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
    
    const initialTransform = d3.zoomIdentity.translate(canvas.width / 2, canvas.height * 0.8);
    transformRef.current = initialTransform;
    (canvas as any).__zoom = initialTransform;

    // Initial camera position
    cameraTargetRef.current = {
       x: canvas.width / 2,
       y: canvas.height * 0.4,
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
          top: '210px',
          right: '40px',
          color: '#00b8ff',
          fontFamily: 'monospace',
          fontSize: '14px',
          pointerEvents: 'none',
          textShadow: '0 0 8px rgba(0, 184, 255, 0.5)',
          textAlign: 'right'
        }}>
          climbing the tree...
        </div>
      )}
    </div>
  );
});

export default CollatzTree;

import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import * as d3 from 'd3';

export interface CollatzTreeRef {
  followPath: (seed: number) => void;
}

interface Node {
  id: number;
  x: number;
  y: number;
  angle: number;
  parent: number | null;
  depth: number;
}

const CollatzTree = forwardRef<CollatzTreeRef, {}>((_props, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [nodesMap] = useState<Map<number, Node>>(new Map());
  const maxNodes = 10000;
  
  // Transform state for semantic zoom/pan
  const transformRef = useRef(d3.zoomIdentity);
  const animationRef = useRef<number | undefined>(undefined);
  
  // Active path for pulsing
  const activePathRef = useRef<{ nodes: Node[], progress: number } | null>(null);

  const initTree = () => {
    nodesMap.clear();
    // Root node (1)
    nodesMap.set(1, {
      id: 1,
      x: 0,
      y: 0,
      angle: -Math.PI / 2, // pointing up
      parent: null,
      depth: 0,
    });

    const len = 12; // base length
    
    // Generate paths from 2 to maxNodes
    for (let i = 2; i <= maxNodes; i++) {
      let current = i;
      const path: number[] = [];
      
      // Find path to an existing node
      while (!nodesMap.has(current)) {
        path.push(current);
        current = current % 2 === 0 ? current / 2 : current * 3 + 1;
      }
      
      // Backtrack to build nodes
      for (let j = path.length - 1; j >= 0; j--) {
        const val = path[j];
        const parentNode = nodesMap.get(current)!;
        
        let newAngle = parentNode.angle;
        if (val % 2 === 0) {
          // It was even, curve slightly right
          newAngle += 0.08 + (Math.random() * 0.02 - 0.01);
        } else {
          // It was odd, sharp left branch
          newAngle -= 0.3 + (Math.random() * 0.05 - 0.02);
        }
        
        const depth = parentNode.depth + 1;
        const currentLen = Math.max(2, len * Math.pow(0.99, depth));
        
        nodesMap.set(val, {
          id: val,
          x: parentNode.x + Math.cos(newAngle) * currentLen,
          y: parentNode.y + Math.sin(newAngle) * currentLen,
          angle: newAngle,
          parent: current,
          depth: depth
        });
        
        current = val;
      }
    }
  };

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    
    // Clear background
    ctx.clearRect(0, 0, width, height);
    
    ctx.save();
    
    // Apply D3 transform
    const t = transformRef.current;
    // We center the root at bottom center
    ctx.translate(width / 2 + t.x, height * 0.8 + t.y);
    ctx.scale(t.k, t.k);

    // Draw background tree
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // Draw all edges
    ctx.beginPath();
    for (const [, node] of nodesMap.entries()) {
      if (node.parent) {
        const p = nodesMap.get(node.parent)!;
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(node.x, node.y);
      }
    }
    
    ctx.strokeStyle = 'rgba(0, 255, 170, 0.15)';
    ctx.lineWidth = 0.5 / t.k;
    ctx.stroke();

    // Draw active path pulse
    const active = activePathRef.current;
    if (active && active.nodes.length > 0) {
      const nodes = active.nodes;
      
      // Draw solid highlighted path so far
      ctx.beginPath();
      ctx.moveTo(nodes[0].x, nodes[0].y);
      for(let i = 1; i < nodes.length; i++) {
        ctx.lineTo(nodes[i].x, nodes[i].y);
      }
      ctx.strokeStyle = 'rgba(0, 184, 255, 0.3)';
      ctx.lineWidth = 1.5 / t.k;
      ctx.stroke();
      
      // Draw the pulsing head
      const targetIdx = Math.floor(active.progress);
      if (targetIdx < nodes.length - 1) {
        const n1 = nodes[targetIdx];
        const n2 = nodes[targetIdx + 1];
        const subProgress = active.progress - targetIdx;
        
        const px = n1.x + (n2.x - n1.x) * subProgress;
        const py = n1.y + (n2.y - n1.y) * subProgress;
        
        ctx.beginPath();
        ctx.arc(px, py, 3 / t.k, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#00ffaa';
        ctx.shadowBlur = 15 / t.k;
        ctx.fill();
        ctx.shadowBlur = 0; // reset
      }

      // Update progress for next frame
      active.progress += 0.5; // speed of pulse
      if (active.progress >= nodes.length - 1) {
         // Keep glowing at the end or reset? Let's just hold it at the end
         active.progress = nodes.length - 1;
      }
    }

    ctx.restore();
    
    animationRef.current = requestAnimationFrame(draw);
  };

  useImperativeHandle(ref, () => ({
    followPath: (seed: number) => {
      // 1. Generate nodes if missing (extend tree dynamically)
      let current = seed;
      const pathSeq: number[] = [];
      while (!nodesMap.has(current)) {
        pathSeq.push(current);
        current = current % 2 === 0 ? current / 2 : current * 3 + 1;
      }
      
      // Backtrack to add missing to map
      for (let j = pathSeq.length - 1; j >= 0; j--) {
        const val = pathSeq[j];
        const parentNode = nodesMap.get(current)!;
        let newAngle = parentNode.angle;
        if (val % 2 === 0) {
          newAngle += 0.08 + (Math.random() * 0.02 - 0.01);
        } else {
          newAngle -= 0.3 + (Math.random() * 0.05 - 0.02);
        }
        const depth = parentNode.depth + 1;
        const currentLen = Math.max(2, 12 * Math.pow(0.99, depth));
        nodesMap.set(val, {
          id: val,
          x: parentNode.x + Math.cos(newAngle) * currentLen,
          y: parentNode.y + Math.sin(newAngle) * currentLen,
          angle: newAngle,
          parent: current,
          depth: depth
        });
        current = val;
      }

      // 2. Build full path from seed down to 1
      const fullPath: Node[] = [];
      let c = seed;
      while (c !== null) {
        const n = nodesMap.get(c)!;
        fullPath.push(n);
        c = n.parent as number; // TypeScript hack
        if (c === null) break;
      }

      // Start the pulse animation
      activePathRef.current = {
        nodes: fullPath,
        progress: 0
      };

      // 3. Smooth pan to the seed node
      const targetNode = nodesMap.get(seed)!;
      const svg = d3.select(canvasRef.current);
      const zoom = d3.zoom<HTMLCanvasElement, unknown>()
        .scaleExtent([0.1, 10])
        .on('zoom', (e) => {
          transformRef.current = e.transform;
        });
      
      svg.call(zoom as any);
      
      const canvas = canvasRef.current;
      if (canvas) {
        const height = canvas.height;
        // We want targetNode.x, targetNode.y to be at the center of the screen
        // In draw, we translate by width/2, height*0.8
        // So target pos in canvas is: width/2 + x*k + tx = width/2  => tx = -x*k
        // height*0.8 + y*k + ty = height/2 => ty = height/2 - height*0.8 - y*k = -height*0.3 - y*k
        
        const k = Math.min(2, transformRef.current.k); // zoom in slightly
        const tx = -targetNode.x * k;
        const ty = -height * 0.3 - targetNode.y * k;
        
        svg.transition()
           .duration(1500)
           .call(
             zoom.transform as any, 
             d3.zoomIdentity.translate(tx, ty).scale(k)
           );
      }
    }
  }));

  useEffect(() => {
    initTree();

    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resize = () => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    };
    
    window.addEventListener('resize', resize);
    resize();

    // Setup D3 Zoom
    const zoom = d3.zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.1, 10])
      .on('zoom', (e) => {
        transformRef.current = e.transform;
      });

    d3.select(canvas).call(zoom as any);

    // Initial transform (zoom out slightly to see the tree)
    d3.select(canvas).call(zoom.transform as any, d3.zoomIdentity.translate(0, 100).scale(0.6));

    animationRef.current = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener('resize', resize);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  return (
    <div ref={containerRef} className="canvas-container">
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
    </div>
  );
});

export default CollatzTree;

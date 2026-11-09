import { useRef, useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import './App.css';
import CollatzTree, { type CollatzTreeRef } from './CollatzTree';

const PRESET_SEEDS = [
  { label: '27', value: 27 },
  { label: '7', value: 7 },
  { label: '97', value: 97 },
  { label: '871', value: 871 },
  { label: '6171', value: 6171 },
];

const INTERESTING_RANDOMS = [
  15, 27, 31, 41, 47, 54, 71, 97, 108, 127, 231, 313, 703, 871, 1023, 2047, 6171
];

function calculateSequence(num: number): number[] {
  const seq: number[] = [];
  let curr = num;
  while (curr > 1) {
    seq.push(curr);
    curr = curr % 2 === 0 ? curr / 2 : curr * 3 + 1;
  }
  seq.push(1);
  return seq;
}

function pickRandomSeed(exclude: number): number {
  const available = INTERESTING_RANDOMS.filter(n => n !== exclude);
  return available[Math.floor(Math.random() * available.length)] || 27;
}

function App() {
  const [seed, setSeed] = useState<string>('27');
  const [treeState, setTreeState] = useState<'IDLE' | 'BUILDING' | 'BUILT'>('IDLE');
  const [isExploreMode, setIsExploreMode] = useState(false);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 768);
  
  const [speed, setSpeed] = useState(3);
  const [isPaused, setIsPaused] = useState(false);
  const [palette, setPalette] = useState<'dark' | 'light'>('dark');

  const [edgeStyle, setEdgeStyle] = useState<'curved' | 'straight'>('curved');
  const density = 'high'; 
  
  const [hoveredNodeId, setHoveredNodeId] = useState<number | null>(null);
  const [isSequenceMode, setIsSequenceMode] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [sequence, setSequence] = useState<number[]>(() => calculateSequence(27));
  const [pendingSeed, setPendingSeed] = useState<number | null>(null);

  const treeRef = useRef<CollatzTreeRef>(null);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const updateSequence = (num: number) => {
    setSequence(calculateSequence(num));
  };

  const handleAction = () => {
    const num = parseInt(seed, 10);
    if (!isNaN(num) && num > 0) {
      if (treeState === 'IDLE') {
        setTreeState('BUILDING');
        updateSequence(num);
        
        setTimeout(() => {
          treeRef.current?.buildTree(num, () => {
            setTreeState('BUILT');
            confetti({
              particleCount: 150,
              spread: 80,
              origin: { y: 0.6 },
              colors: palette === 'dark' ? ['#00ffaa', '#00b8ff', '#ffffff'] : ['#009650', '#0064c8', '#ffffff']
            });
          });
        }, 50);
      } else if (treeState === 'BUILDING') {
        treeRef.current?.stopBuilding();
        setTreeState('IDLE');
      } else if (treeState === 'BUILT') {
        setIsPaused(false);
        treeRef.current?.followPathDown(num);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleAction();
    }
  };

  const handleSeedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSeed(e.target.value);
    setTreeState('IDLE');
  };

  const toggleExploreMode = () => {
    setIsExploreMode(!isExploreMode);
    treeRef.current?.setExploreMode(!isExploreMode);
  };

  const handleSelectNode = (nodeId: number) => {
    setSeed(nodeId.toString());
    setTreeState('BUILDING');
    updateSequence(nodeId);
    treeRef.current?.buildTree(nodeId, () => {
      setTreeState('BUILT');
      confetti({
        particleCount: 100,
        spread: 60,
        origin: { y: 0.6 },
        colors: palette === 'dark' ? ['#00ffaa', '#00b8ff', '#ffffff'] : ['#009650', '#0064c8', '#ffffff']
      });
    });
  };

  const handleRandomSeed = () => {
    const currentNum = parseInt(seed, 10);
    const chosen = pickRandomSeed(currentNum);
    handleSelectNode(chosen);
  };

  const handleSaveImage = () => {
    const svgUrl = treeRef.current?.exportImage();
    if (svgUrl) {
      const a = document.createElement('a');
      a.href = svgUrl;
      a.download = `collatz-tree-${seed}.svg`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(svgUrl), 1000);
    }
  };

  const maxVal = sequence.length > 0 ? Math.max(...sequence) : 1;
  const oddStepsCount = sequence.filter(n => n % 2 !== 0).length;
  const evenStepsCount = sequence.length - oddStepsCount;

  // Render SVG Sparkline for Hailstone altitude
  const renderSparkline = () => {
    if (sequence.length < 2) return null;
    const width = 260;
    const height = 70;
    const padding = 8;
    const chartW = width - padding * 2;
    const chartH = height - padding * 2;

    const points = sequence.map((val, idx) => {
      const x = padding + (idx / (sequence.length - 1)) * chartW;
      const y = padding + chartH - (val / maxVal) * chartH;
      return { x, y, val, idx };
    });

    const pathD = points.reduce((acc, pt, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`, '');
    const areaD = `${pathD} L ${(padding + chartW).toFixed(1)} ${(padding + chartH).toFixed(1)} L ${padding.toFixed(1)} ${(padding + chartH).toFixed(1)} Z`;

    return (
      <div className="sparkline-container" role="region" aria-label="Hailstone altitude chart">
        <svg viewBox={`0 0 ${width} ${height}`} className="sparkline-svg">
          <defs>
            <linearGradient id="altitudeGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary-glow)" stopOpacity="0.4" />
              <stop offset="100%" stopColor="var(--primary-glow)" stopOpacity="0.0" />
            </linearGradient>
          </defs>
          <path d={areaD} fill="url(#altitudeGradient)" />
          <path d={pathD} fill="none" stroke="var(--primary-glow)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          {points.map((pt) => {
            const isHovered = hoveredNodeId === pt.val;
            return (
              <circle
                key={pt.idx}
                cx={pt.x}
                cy={pt.y}
                r={isHovered ? 4.5 : 2}
                fill={isHovered ? '#ff00b8' : 'var(--primary-glow)'}
                className="sparkline-dot"
                onMouseEnter={() => setHoveredNodeId(pt.val)}
                onMouseLeave={() => setHoveredNodeId(null)}
                onClick={() => {
                  treeRef.current?.focusOnNode(pt.val);
                }}
              />
            );
          })}
        </svg>
        <div className="sparkline-labels">
          <span>start: {sequence[0]}</span>
          <span>peak: {maxVal}</span>
          <span>end: 1</span>
        </div>
      </div>
    );
  };

  return (
    <div className={`app-container ${palette}`} role="main" aria-label="Collatz Visualizer Application">
      <div className="title-overlay" aria-hidden="true">
        <h1><span>collatz</span> visualizer</h1>
        <div className="subtitle">
          <span className="rule-text">if even divide by two</span><br/>
          <span className="rule-text">if odd multiply by three and add one</span><br/>
          <span className="bottom-text">we always seem to get to one at the end</span><br/>
          <a href="https://en.wikipedia.org/wiki/Collatz_conjecture" target="_blank" rel="noopener noreferrer" className="wiki-link">
            see wikipedia for more
          </a>
        </div>
      </div>
      
      {/* Screen Reader Only Announcement Region */}
      <div className="sr-only" aria-live="polite" role="status">
        {treeState === 'BUILDING' && 'Building tree for seed ' + seed}
        {treeState === 'BUILT' && 'Tree built successfully for seed ' + seed}
        {treeState === 'IDLE' && 'Ready. Enter a seed number to begin.'}
      </div>

      <CollatzTree 
        ref={treeRef} 
        speed={speed} 
        isPaused={isPaused} 
        palette={palette} 
        edgeStyle={edgeStyle}
        density={density}
        hoveredNodeId={hoveredNodeId}
        onHoverNode={setHoveredNodeId}
        onSelectNode={handleSelectNode}
        onRequestSeed={setPendingSeed}
        onPathComplete={() => {
          confetti({
            particleCount: 200,
            spread: 100,
            origin: { y: 0.6 },
            colors: palette === 'dark' ? ['#00ffaa', '#00b8ff', '#ffffff'] : ['#009650', '#0064c8', '#ffffff']
          });
        }}
      />

      {/* Floating Canvas Navigation HUD */}
      <div className="canvas-hud" role="toolbar" aria-label="Canvas Navigation">
        <div className="hud-zoom-row">
          <button 
            className="hud-btn hud-zoom-btn" 
            onClick={() => treeRef.current?.zoomIn()} 
            title="Zoom in"
            aria-label="Zoom in"
          >
            +
          </button>
          <button 
            className="hud-btn hud-zoom-btn" 
            onClick={() => treeRef.current?.zoomOut()} 
            title="Zoom out"
            aria-label="Zoom out"
          >
            −
          </button>
        </div>
        <button 
          className="hud-btn" 
          onClick={() => treeRef.current?.resetView()} 
          title="Reset canvas view"
          aria-label="Reset canvas view"
        >
          reset
        </button>
        <button 
          className="hud-btn" 
          onClick={() => setIsPaused(!isPaused)}
          aria-label={isPaused ? 'Resume Animation' : 'Pause Animation'}
        >
          {isPaused ? 'resume' : 'pause'}
        </button>
      </div>

      {/* Bottom Main UI Controls & Presets */}
      <div className="bottom-dock">
        <div className="presets-bar" role="region" aria-label="Seed Presets">
          {!isMobile && <span className="presets-label">seeds:</span>}
          {PRESET_SEEDS.map(p => (
            <button
              key={p.value}
              className={`preset-chip ${seed === p.value.toString() && treeState !== 'IDLE' ? 'active' : ''}`}
              onClick={() => handleSelectNode(p.value)}
              disabled={treeState === 'BUILDING'}
              aria-label={`Use seed ${p.value}`}
            >
              {p.label}
            </button>
          ))}
          <button
            className="preset-chip random-chip"
            onClick={handleRandomSeed}
            disabled={treeState === 'BUILDING'}
            aria-label="Pick a random seed number"
          >
            random
          </button>
        </div>

        <div className="ui-overlay" role="region" aria-label="Main Controls">
          <label htmlFor="seed-input" className="sr-only">Seed Number</label>
          <div className="input-wrap">
            <input 
              id="seed-input"
              type="number" 
              className="seed-input" 
              placeholder={isMobile ? 'seed...' : 'enter seed number...'} 
              value={seed}
              onChange={handleSeedChange}
              onKeyDown={handleKeyDown}
              min="1"
              aria-label="Seed number input for Collatz sequence"
              disabled={treeState === 'BUILDING'}
            />
            {seed && treeState === 'IDLE' && (
              <button 
                type="button" 
                className="input-clear-btn" 
                onClick={() => setSeed('')}
                aria-label="Clear seed input"
              >
                ×
              </button>
            )}
          </div>
          <button 
            className="action-btn" 
            onClick={handleAction}
            aria-label={
              treeState === 'IDLE' ? 'plant seed and grow tree' :
              treeState === 'BUILDING' ? 'cancel tree growth' :
              'trace path upward from one'
            }
          >
            {treeState === 'IDLE' && (isMobile ? 'grow' : 'plant seed & grow tree')}
            {treeState === 'BUILDING' && (isMobile ? 'cancel' : 'stop growing (cancel)')}
            {treeState === 'BUILT' && (isMobile ? 'trace to 1' : 'follow path home (to 1)')}
          </button>
          <button
            className={`action-btn ${isExploreMode ? 'explore-active' : ''}`}
            onClick={toggleExploreMode}
            aria-pressed={isExploreMode}
            aria-label="toggle free explore camera mode"
          >
            {isExploreMode ? 'stop exploring' : 'explore freely'}
          </button>
        </div>
      </div>

      <div className="top-left-container" role="region" aria-label="Settings and Sequence Analysis">
        <button 
          className="collapse-toggle" 
          onClick={() => setShowControls(!showControls)}
          aria-expanded={showControls}
          aria-label={showControls ? 'Hide controls menu' : 'Show controls menu'}
        >
          {showControls ? 'hide controls' : 'show controls'}
        </button>

        {showControls && (
          <div className="expanded-controls-grid">
            <div className="controls-overlay-mobile">
              <button onClick={() => setIsSequenceMode(!isSequenceMode)}>
                {isSequenceMode ? 'hide sequence analysis' : 'show sequence analysis'}
              </button>

              <button onClick={() => setIsPaused(!isPaused)}>
                {isPaused ? 'resume animation' : 'pause animation'}
              </button>
              
              <div className="slider-container">
                <div className="slider-header">
                  <label htmlFor="speed-slider">speed of descent to one</label>
                  <span className="slider-val-hint">{speed}x</span>
                </div>
                <input 
                  id="speed-slider"
                  type="range" 
                  min="1" 
                  max="5" 
                  value={speed} 
                  onChange={e => setSpeed(parseInt(e.target.value, 10))} 
                  aria-label="Animation Speed (1 slow to 5 fast)"
                />
                <div className="slider-scale-labels">
                  <span>slow</span>
                  <span>fast</span>
                </div>
              </div>

              <div className="slider-container">
                <label htmlFor="edge-select">branch drawing style</label>
                <select 
                  id="edge-select"
                  className="lowcase-select" 
                  value={edgeStyle} 
                  onChange={e => setEdgeStyle(e.target.value as 'curved' | 'straight')}
                  aria-label="Branch edge drawing style selection"
                >
                  <option value="curved">curved lines</option>
                  <option value="straight">straight lines</option>
                </select>
              </div>

              <button onClick={() => setPalette(p => p === 'dark' ? 'light' : 'dark')}>
                {palette === 'dark' ? 'toggle light mode' : 'toggle dark mode'}
              </button>

              <button onClick={handleSaveImage}>
                export tree svg
              </button>
            </div>

            {isSequenceMode && (
              <div className="plan-overlay-mobile">
                <div className="plan-title">analysis for seed {sequence[0] || seed}</div>
                {renderSparkline()}
                <div className="plan-stats-grid">
                  <div className="plan-stat"><span>peak:</span> <strong>{maxVal}</strong></div>
                  <div className="plan-stat"><span>steps:</span> <strong>{sequence.length - 1}</strong></div>
                  <div className="plan-stat"><span>even:</span> <strong>{evenStepsCount}</strong></div>
                  <div className="plan-stat"><span>odd:</span> <strong>{oddStepsCount}</strong></div>
                </div>
                <div className="step-list-mini">
                  {sequence.map((val, idx) => {
                    const isHovered = hoveredNodeId === val;
                    return (
                      <div 
                        key={idx} 
                        className={`plan-step ${isHovered ? 'hovered' : ''}`}
                        onMouseEnter={() => setHoveredNodeId(val)} 
                        onMouseLeave={() => setHoveredNodeId(null)} 
                        onClick={() => {
                          treeRef.current?.focusOnNode(val);
                        }}
                        title="Click to focus node on tree"
                      >
                        step {idx}: {val} <span style={{opacity: 0.5}}>{val % 2 === 0 ? '(even)' : '(odd)'}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {pendingSeed !== null && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>plant new seed?</h2>
            <p>clear the current tree and use <strong>{pendingSeed}</strong> as the new seed?</p>
            <div className="modal-actions">
              <button className="modal-btn confirm" onClick={() => { handleSelectNode(pendingSeed); setPendingSeed(null); }}>yes, grow</button>
              <button className="modal-btn cancel" onClick={() => setPendingSeed(null)}>cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
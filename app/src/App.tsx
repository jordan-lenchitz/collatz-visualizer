import { useRef, useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import './App.css';
import CollatzTree, { type CollatzTreeRef } from './CollatzTree';

function App() {
  const [seed, setSeed] = useState<string>('27');
  const [treeState, setTreeState] = useState<'IDLE' | 'BUILDING' | 'BUILT'>('IDLE');
  const [isExploreMode, setIsExploreMode] = useState(false);
  
  const [speed, setSpeed] = useState(3);
  const [isPaused, setIsPaused] = useState(false);
  const [palette, setPalette] = useState<'dark' | 'light'>('dark');
  
  const [layoutMode, setLayoutMode] = useState<'organic' | 'radial' | 'symmetric' | 'force'>('organic');
  const [edgeStyle, setEdgeStyle] = useState<'curved' | 'straight'>('curved');
  
  // High density by default, controlled in backend for performance
  const density = 'high'; 
  
  const [hoveredNodeId, setHoveredNodeId] = useState<number | null>(null);
  const [isPlanMode, setIsPlanMode] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [sequence, setSequence] = useState<number[]>([]);

  const treeRef = useRef<CollatzTreeRef>(null);

  useEffect(() => {
    updateSequence(27);
  }, []);

  const updateSequence = (num: number) => {
    const seq = [];
    let curr = num;
    while (curr > 1) {
      seq.push(curr);
      curr = curr % 2 === 0 ? curr / 2 : curr * 3 + 1;
    }
    seq.push(1);
    setSequence(seq);
  };

  const handleAction = () => {
    const num = parseInt(seed, 10);
    if (!isNaN(num) && num > 0) {
      if (treeState === 'IDLE') {
        setTreeState('BUILDING');
        updateSequence(num);
        
        // Tiny timeout to allow the React state (BUILDING overlay) to render before blocking the main thread
        setTimeout(() => {
          treeRef.current?.buildTree(num, () => {
            setTreeState('BUILT');
            treeRef.current?.followPathDown(num);
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

  const maxVal = sequence.length > 0 ? Math.max(...sequence) : 1;

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
        layoutMode={layoutMode}
        edgeStyle={edgeStyle}
        density={density}
        hoveredNodeId={hoveredNodeId}
        onHoverNode={setHoveredNodeId}
        onSelectNode={handleSelectNode}
        onPathComplete={() => {
          confetti({
            particleCount: 200,
            spread: 100,
            origin: { y: 0.6 },
            colors: palette === 'dark' ? ['#00ffaa', '#00b8ff', '#ffffff'] : ['#009650', '#0064c8', '#ffffff']
          });
        }}
      />

      <div className="ui-overlay" role="region" aria-label="Main Controls">
        <label htmlFor="seed-input" className="sr-only">Seed Number</label>
        <input 
          id="seed-input"
          type="number" 
          className="seed-input" 
          placeholder="enter seed number..." 
          value={seed}
          onChange={handleSeedChange}
          onKeyDown={handleKeyDown}
          min="1"
          aria-label="Seed number input for Collatz sequence"
          disabled={treeState === 'BUILDING'}
        />
        <button 
          className="action-btn" 
          onClick={handleAction}
          aria-label={
            treeState === 'IDLE' ? 'Plant Seed and Grow Tree' :
            treeState === 'BUILDING' ? 'Cancel Tree Growth' :
            'Follow Path down to One'
          }
        >
          {treeState === 'IDLE' && 'Plant Seed & Grow Tree'}
          {treeState === 'BUILDING' && 'Stop Growing (Cancel)'}
          {treeState === 'BUILT' && 'Follow Path to One'}
        </button>
        <button
          className={`action-btn ${isExploreMode ? 'explore-active' : ''}`}
          onClick={toggleExploreMode}
          aria-pressed={isExploreMode}
          aria-label="Toggle free explore camera mode"
        >
          {isExploreMode ? 'Stop Exploring' : 'Explore Freely'}
        </button>
      </div>

      <div className="top-left-container" role="region" aria-label="Settings and Plan Mode">
        <button 
          className="collapse-toggle" 
          onClick={() => setShowControls(!showControls)}
          aria-expanded={showControls}
          aria-label={showControls ? 'Hide controls menu' : 'Show controls menu'}
        >
          {showControls ? 'hide controls ⚙️' : 'show controls ⚙️'}
        </button>

        {showControls && (
          <div className="expanded-controls-grid">
            <div className="controls-overlay-mobile">
               <button onClick={() => setIsPlanMode(!isPlanMode)}>
                 {isPlanMode ? 'hide plan mode' : 'show plan mode'}
               </button>

               <button onClick={() => setIsPaused(!isPaused)}>
                 {isPaused ? 'resume animation' : 'pause to admire'}
               </button>
               
               <div className="slider-container">
                 <label htmlFor="speed-slider">speed of descent to one</label>
                 <input 
                   id="speed-slider"
                   type="range" 
                   min="1" 
                   max="5" 
                   value={speed} 
                   onChange={e => setSpeed(parseInt(e.target.value))} 
                   aria-label="Animation Speed"
                 />
               </div>

               <div className="slider-container">
                 <label htmlFor="layout-select">tree layout mode</label>
                 <select 
                   id="layout-select"
                   className="lowcase-select" 
                   value={layoutMode} 
                   onChange={e => setLayoutMode(e.target.value as any)}
                   aria-label="Tree layout mode selection"
                 >
                   <option value="organic">organic</option>
                   <option value="radial">celestial</option>
                   <option value="symmetric">symmetric</option>
                   <option value="force">force galaxy</option>
                 </select>
               </div>

               <div className="slider-container">
                 <label htmlFor="edge-select">branch drawing style</label>
                 <select 
                   id="edge-select"
                   className="lowcase-select" 
                   value={edgeStyle} 
                   onChange={e => setEdgeStyle(e.target.value as any)}
                   aria-label="Branch edge drawing style selection"
                 >
                   <option value="curved">curved lines</option>
                   <option value="straight">straight lines</option>
                 </select>
               </div>

               <button onClick={() => setPalette(p => p === 'dark' ? 'light' : 'dark')}>
                 {palette === 'dark' ? 'toggle light mode' : 'toggle dark mode'}
               </button>
            </div>

            {isPlanMode && (
              <div className="plan-overlay-mobile">
                <div className="plan-title">analysis for seed {sequence[0] || seed}</div>
                <div className="plan-stat">peak value: {maxVal}</div>
                <div className="plan-stat">path length: {sequence.length - 1}</div>
                <div className="step-list-mini">
                  {sequence.map((val, idx) => {
                    const isHovered = hoveredNodeId === val;
                    return (
                      <div 
                        key={idx} 
                        className={`plan-step ${isHovered ? 'hovered' : ''}`}
                        onMouseEnter={() => setHoveredNodeId(val)} 
                        onMouseLeave={() => setHoveredNodeId(null)} 
                        onClick={() => { handleSelectNode(val); treeRef.current?.focusOnNode(val); }}
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
    </div>
  );
}

export default App;

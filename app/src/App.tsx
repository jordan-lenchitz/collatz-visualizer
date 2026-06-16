import { useRef, useState, useEffect } from 'react';
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
        treeRef.current?.buildTree(num, () => {
          setTreeState('BUILT');
        });
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
    });
  };

  const maxVal = sequence.length > 0 ? Math.max(...sequence) : 1;

  return (
    <div className={`app-container ${palette}`}>
      <div className="title-overlay">
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
      />

      <div className="ui-overlay">
        <input 
          type="number" 
          className="seed-input" 
          placeholder="enter seed number..." 
          value={seed}
          onChange={handleSeedChange}
          onKeyDown={handleKeyDown}
          min="1"
          disabled={treeState === 'BUILDING'}
        />
        <button 
          className="action-btn" 
          onClick={handleAction}
          disabled={treeState === 'BUILDING'}
        >
          {treeState === 'IDLE' && 'plant and grow the tree from one up to your number'}
          {treeState === 'BUILDING' && 'growing...'}
          {treeState === 'BUILT' && 'follow path to one!'}
        </button>
        <button
          className={`action-btn ${isExploreMode ? 'explore-active' : ''}`}
          onClick={toggleExploreMode}
        >
          {isExploreMode ? 'stop exploring (auto-follow)' : 'explore freely'}
        </button>
      </div>

      <div className="top-left-container">
        <button className="collapse-toggle" onClick={() => setShowControls(!showControls)}>
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
                 <label>speed of descent to one</label>
                 <input type="range" min="1" max="5" value={speed} onChange={e => setSpeed(parseInt(e.target.value))} />
               </div>

               <div className="slider-container">
                 <label>tree layout mode</label>
                 <select className="lowcase-select" value={layoutMode} onChange={e => setLayoutMode(e.target.value as any)}>
                   <option value="organic">organic</option>
                   <option value="radial">celestial</option>
                   <option value="symmetric">symmetric</option>
                   <option value="force">force galaxy</option>
                 </select>
               </div>

               <div className="slider-container">
                 <label>branch drawing style</label>
                 <select className="lowcase-select" value={edgeStyle} onChange={e => setEdgeStyle(e.target.value as any)}>
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

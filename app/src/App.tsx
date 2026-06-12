import { useRef, useState } from 'react';
import './App.css';
import CollatzTree, { type CollatzTreeRef } from './CollatzTree';

function App() {
  const [seed, setSeed] = useState<string>('27');
  const [treeState, setTreeState] = useState<'IDLE' | 'BUILDING' | 'BUILT'>('IDLE');
  const [isExploreMode, setIsExploreMode] = useState(false);
  const treeRef = useRef<CollatzTreeRef>(null);

  const handleAction = () => {
    const num = parseInt(seed, 10);
    if (!isNaN(num) && num > 0) {
      if (treeState === 'IDLE') {
        setTreeState('BUILDING');
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

  return (
    <div className="app-container">
      <div className="title-overlay">
        <h1><span>collatz</span> visualizer</h1>
        <div className="subtitle">
          <span className="rule-text">if even divide by two</span><br/>
          <span className="rule-text">if odd multiply by three and add one</span><br/>
          <span className="bottom-text">we always seem to get to one at the end</span>
        </div>
      </div>
      
      <CollatzTree ref={treeRef} />

      <div className="ui-overlay">
        <input 
          type="number" 
          className="seed-input" 
          placeholder="Enter seed number..." 
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
    </div>
  );
}

export default App;

import { useRef, useState } from 'react';
import './App.css';
import CollatzTree, { type CollatzTreeRef } from './CollatzTree';

function App() {
  const [seed, setSeed] = useState<string>('27');
  const treeRef = useRef<CollatzTreeRef>(null);

  const handleVisualize = () => {
    const num = parseInt(seed, 10);
    if (!isNaN(num) && num > 0) {
      treeRef.current?.followPath(num);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleVisualize();
    }
  };

  return (
    <div className="app-container">
      <div className="title-overlay">
        <h1><span>3n+1</span> Visualizer</h1>
      </div>
      
      <CollatzTree ref={treeRef} />

      <div className="ui-overlay">
        <input 
          type="number" 
          className="seed-input" 
          placeholder="Enter seed number..." 
          value={seed}
          onChange={(e) => setSeed(e.target.value)}
          onKeyDown={handleKeyDown}
          min="1"
        />
        <button className="action-btn" onClick={handleVisualize}>
          Follow Path to 1
        </button>
      </div>
    </div>
  );
}

export default App;

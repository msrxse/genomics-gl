import { GenomeBrowserView } from './components/GenomeBrowserView';

function App() {
  return (
    <div style={{ padding: '1rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>
        GenomicsGL — chr22 Gene Browser
      </h1>
      <GenomeBrowserView />
    </div>
  );
}

export default App

import { GenomeBrowserView } from './components/GenomeBrowserView';

function App() {
  return (
    <div className="min-h-screen flex flex-col justify-center p-4">
      <h1 className="text-lg font-semibold mb-2">
        GenomicsGL — chr22 Gene Browser
      </h1>
      <GenomeBrowserView />
    </div>
  );
}

export default App

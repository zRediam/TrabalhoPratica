import { useState } from 'react';

function UploadNota({ onExtract, isLoading }) {
  const [file, setFile] = useState(null);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (file) {
      onExtract(file);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-xl overflow-hidden animate-fade-in border border-gray-100">
      <div className="p-8">
        <h2 className="text-xl font-semibold flex items-center gap-2 mb-6 text-gray-800">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          Arquivo da nota
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Escolha um PDF (nota fiscal, NF-e ou documento equivalente)</label>
            <div className="relative group">
              <input 
                type="file" 
                accept="application/pdf"
                onChange={handleFileChange}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-3 file:px-6 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 transition-colors border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" 
                required 
              />
            </div>
            {file && (
              <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-lg flex items-center justify-between text-blue-800">
                <div className="flex items-center space-x-2 truncate">
                   <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                   <span className="truncate max-w-[200px] sm:max-w-md font-medium text-sm">{file.name}</span>
                </div>
                <span className="text-xs shrink-0 font-medium bg-blue-100 px-2 py-1 rounded">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </span>
              </div>
            )}
          </div>

          <button 
            type="submit" 
            disabled={!file || isLoading}
            className={`w-full py-3 px-4 rounded-xl flex items-center justify-center font-bold text-white transition-all transform tracking-wide ${
              (!file || isLoading) 
                ? 'bg-gray-400 cursor-not-allowed opacity-70' 
                : 'bg-gray-900 hover:bg-black hover:shadow-lg focus:ring-4 focus:ring-gray-200 active:scale-[0.98]'
            }`}
          >
            {isLoading ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                EXTRAINDO...
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Gerar rascunho
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

export default UploadNota;

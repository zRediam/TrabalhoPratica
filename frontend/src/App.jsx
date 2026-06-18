import { useState, useEffect } from 'react';
import UploadNota from './components/UploadNota';
import JsonViewer from './components/JsonViewer';
import QueryRag from './components/QueryRag';
import Login from './components/Login';
import ContasManager from './components/ContasManager';
import PessoasManager from './components/PessoasManager';
import ClassificacoesManager from './components/ClassificacoesManager';
import UsuariosManager from './components/UsuariosManager';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
const NOTAS_API = `${API_BASE_URL}/api/notas`;

function App() {
  const [usuario, setUsuario] = useState(null);
  const [currentView, setCurrentView] = useState('notas'); // 'notas' | 'contas' | 'pessoas' | 'classificacoes'
  const [seedLoading, setSeedLoading] = useState(false);
  const [seedMessage, setSeedMessage] = useState(null);
  const [seedError, setSeedError] = useState(null);
  
  const [isExtracting, setIsExtracting] = useState(false);
  const [data, setData] = useState(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveMessage, setSaveMessage] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [extractionError, setExtractionError] = useState(null);
  const [queryText, setQueryText] = useState('');
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryError, setQueryError] = useState(null);
  const [queryResult, setQueryResult] = useState(null);

  // Verificar sessão ao carregar
  useEffect(() => {
    const usuarioSalvo = localStorage.getItem('usuario');
    if (usuarioSalvo) {
      setUsuario(JSON.parse(usuarioSalvo));
    }
  }, []);

  const handleLoginSuccess = (usuarioData) => {
    setUsuario(usuarioData);
  };

  const handleLogout = () => {
    fetch(`${API_BASE_URL}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include'
    })
      .then(() => {
        localStorage.removeItem('usuario');
        setUsuario(null);
        setData(null);
        setQueryResult(null);
      })
      .catch(console.error);
  };

  // Se não estiver autenticado, mostrar Login
  if (!usuario) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  const handleExtraction = async (file) => {
    setIsExtracting(true);
    setExtractionError(null);
    setSaveMessage(null);
    setSaveError(null);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${NOTAS_API}/extract`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        const backendMessage =
          errorPayload?.details || errorPayload?.error || 'Falha na extração. Verifique a API.';
        throw new Error(backendMessage);
      }

      const result = await response.json();
      setData(result);
    } catch (error) {
      console.error(error);
      setData(null);
      setExtractionError(error.message || 'Falha inesperada na extração.');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSaveToDatabase = async () => {
    if (!data?.parsedData) {
      return;
    }

    setSaveLoading(true);
    setSaveMessage(null);
    setSaveError(null);

    try {
      const response = await fetch(`${NOTAS_API}/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ parsedData: data.parsedData })
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        const validation = payload?.validationErrors?.length
          ? payload.validationErrors.join(' ')
          : null;
        const backendMessage =
          validation || payload?.details || payload?.error || 'Falha ao salvar no banco.';
        throw new Error(backendMessage);
      }

      setData(payload);
      setSaveMessage('Registro concluído: movimento, parcelas e demais vínculos foram gravados.');
    } catch (error) {
      console.error(error);
      setSaveError(error.message || 'Falha inesperada.');
    } finally {
      setSaveLoading(false);
    }
  };

  const handleQuerySubmit = async (event) => {
    event.preventDefault();
    if (!queryText.trim()) {
      setQueryError('Digite sua pergunta para buscar no banco.');
      return;
    }

    setQueryLoading(true);
    setQueryError(null);
    setQueryResult(null);

    try {
      const response = await fetch(`${NOTAS_API}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: queryText.trim() })
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload?.details || payload?.error || 'Falha na consulta RAG.');
      }

      setQueryResult(payload);
    } catch (error) {
      console.error(error);
      setQueryError(error.message || 'Falha inesperada na consulta RAG.');
    } finally {
      setQueryLoading(false);
    }
  };

  const handleTriggerSeed = async () => {
    if (!window.confirm('Isto limpará o banco atual e gerará 200 registros fictícios de teste. Continuar?')) {
      return;
    }

    setSeedLoading(true);
    setSeedMessage(null);
    setSeedError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/seed`, {
        method: 'POST'
      });
      const resData = await response.json();
      if (!response.ok) {
        throw new Error(resData.error || 'Falha ao gerar massa de dados.');
      }
      setSeedMessage(resData.message);
    } catch (err) {
      setSeedError(err.message);
    } finally {
      setSeedLoading(false);
    }
  };

  const renderNotasView = () => {
    return (
      <div className="space-y-6">
        <header className="text-center">
          <h1 className="text-4xl font-bold text-gray-800 tracking-tight">Leitura e lançamento de notas</h1>
          <p className="text-gray-500 mt-2 text-lg max-w-2xl mx-auto">
            Primeiro você importa o documento; em seguida revisa o que foi interpretado e, se estiver certo, registra no sistema.
          </p>
        </header>

        <main className="space-y-6">
          <section className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4 sm:p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-indigo-700 mb-2">1 · Documento</p>
            <p className="text-sm text-indigo-950 font-medium mb-4">Anexe o PDF da nota para gerar o rascunho automaticamente a partir do texto do arquivo.</p>
            <UploadNota onExtract={handleExtraction} isLoading={isExtracting} />
            {extractionError && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900" role="alert">
                {extractionError}
              </div>
            )}
          </section>

          <QueryRag
            question={queryText}
            setQuestion={setQueryText}
            onSubmit={handleQuerySubmit}
            isLoading={queryLoading}
            result={queryResult}
            error={queryError}
          />

          {data && (
            <section className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4 sm:p-5 space-y-4">
              <p className="text-xs font-bold uppercase tracking-widest text-emerald-800">2 · Conferência e lançamento</p>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-emerald-950">Salvar no sistema</p>
                  <p className="text-xs text-emerald-900 mt-1">Confira os blocos abaixo. O botão grava fornecedor, cliente, faturado, classificações, movimento, parcelas e o vínculo em contas a pagar ou receber, reaproveitando cadastros quando já existirem.</p>
                </div>
                <button
                  type="button"
                  onClick={handleSaveToDatabase}
                  disabled={saveLoading || !data?.parsedData}
                  className={`shrink-0 rounded-xl px-5 py-3 font-semibold text-white transition ${saveLoading ? 'bg-gray-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                >
                  {saveLoading ? 'Salvando...' : 'Confirmar e registrar'}
                </button>
              </div>
              {saveMessage && (
                <p className="text-sm text-emerald-800 rounded-lg bg-white/80 border border-emerald-200 px-3 py-2">{saveMessage}</p>
              )}
              {saveError && (
                <p className="text-sm text-red-800 rounded-lg bg-red-50 border border-red-200 px-3 py-2" role="alert">{saveError}</p>
              )}

              <JsonViewer data={data} />
            </section>
          )}
        </main>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row font-sans">
      {/* Barra lateral */}
      <aside className="w-full md:w-64 bg-slate-900 text-white flex flex-col border-r border-slate-800 shrink-0">
        {/* Logo / título */}
        <div className="p-6 border-b border-slate-800 flex items-center gap-3">
          <div>
            <h1 className="font-bold text-lg leading-tight">TBPB</h1>
            <p className="text-xs text-slate-400">Painel Financeiro</p>
          </div>
        </div>
        
        {/* Navegação */}
        <nav className="flex-grow p-4 space-y-1.5">
          <button
            onClick={() => setCurrentView('notas')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition cursor-pointer ${currentView === 'notas' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
          >
            NOTAS
          </button>
          <button
            onClick={() => setCurrentView('contas')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition cursor-pointer ${currentView === 'contas' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
          >
            CONTAS
          </button>
          <button
            onClick={() => setCurrentView('pessoas')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition cursor-pointer ${currentView === 'pessoas' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
          >
            CADASTROS
          </button>
          <button
            onClick={() => setCurrentView('classificacoes')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition cursor-pointer ${currentView === 'classificacoes' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
          >
            CLASSIFICADOS
          </button>
          <button
            onClick={() => setCurrentView('usuarios')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition cursor-pointer ${currentView === 'usuarios' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
          >
            USUARIOS
          </button>
          
          <div className="pt-6 border-t border-slate-800 mt-6 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500 px-4">Ações Rápidas</p>
            <button
              onClick={handleTriggerSeed}
              disabled={seedLoading}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold text-slate-400 hover:bg-emerald-950 hover:text-emerald-300 transition cursor-pointer"
            >
              <span>⚙️</span> {seedLoading ? 'Gerando...' : 'Gerar 200 Itens de Teste'}
            </button>
          </div>
        </nav>

        {/* Perfil do usuário e logout */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/40 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 bg-violet-600 rounded-full flex items-center justify-center text-white font-bold shrink-0">
              {usuario.nome?.[0]?.toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-slate-200 truncate">{usuario.nome}</p>
              <p className="text-slate-500 truncate">{usuario.email}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="p-2 hover:bg-rose-950 text-slate-400 hover:text-rose-400 rounded-lg transition cursor-pointer shrink-0"
            title="Sair"
          >
            🚪
          </button>
        </div>
      </aside>

      {/* Área principal */}
      <main className="flex-grow p-6 md:p-10 overflow-y-auto">
        {seedMessage && (
          <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 flex justify-between items-center" role="alert">
            <span>{seedMessage}</span>
            <button onClick={() => setSeedMessage(null)} className="font-bold cursor-pointer">×</button>
          </div>
        )}
        {seedError && (
          <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 flex justify-between items-center" role="alert">
            <span>{seedError}</span>
            <button onClick={() => setSeedError(null)} className="font-bold cursor-pointer">×</button>
          </div>
        )}

        <div className="max-w-5xl mx-auto">
          {currentView === 'notas' && renderNotasView()}
          {currentView === 'contas' && <ContasManager apiBaseUrl={`${API_BASE_URL}/api`} />}
          {currentView === 'pessoas' && <PessoasManager apiBaseUrl={`${API_BASE_URL}/api`} />}
          {currentView === 'classificacoes' && <ClassificacoesManager apiBaseUrl={`${API_BASE_URL}/api`} />}
          {currentView === 'usuarios' && <UsuariosManager apiBaseUrl={`${API_BASE_URL}/api`} />}
        </div>
      </main>
    </div>
  );
}

export default App;

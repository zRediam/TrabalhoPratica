import { useState } from 'react';
import UploadNota from './components/UploadNota';
import JsonViewer from './components/JsonViewer';
import DatabaseViewer from './components/DatabaseViewer';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
const NOTAS_API = `${API_BASE_URL}/api/notas`;

function App() {
  const [isExtracting, setIsExtracting] = useState(false);
  const [data, setData] = useState(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveMessage, setSaveMessage] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [extractionError, setExtractionError] = useState(null);
  const [verificationData, setVerificationData] = useState(null);
  const [selectedListType, setSelectedListType] = useState('all');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState(null);
  const [statusUpdateLoading, setStatusUpdateLoading] = useState(false);

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

  const handleVerifyDatabase = async (type = 'all') => {
    setVerificationData(null);
    setVerifyError(null);
    setIsVerifying(true);
    setSelectedListType(type);

    try {
      const response = await fetch(`${NOTAS_API}/list?type=${type}`);
      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload?.details || errorPayload?.error || 'Falha ao consultar o banco.');
      }
      const result = await response.json();
      setVerificationData(result);
    } catch (error) {
      console.error(error);
      setVerifyError(error.message || 'Falha inesperada.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleToggleStatus = async (entity, id) => {
    setStatusUpdateLoading(true);
    setVerifyError(null);

    try {
      const response = await fetch(`${NOTAS_API}/toggle-status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity, id })
      });
      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload?.details || errorPayload?.error || 'Falha ao atualizar status.');
      }
      await handleVerifyDatabase(selectedListType);
    } catch (error) {
      console.error(error);
      setVerifyError(error.message || 'Falha inesperada ao atualizar status.');
    } finally {
      setStatusUpdateLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-100 flex flex-col items-center py-10 px-4 font-sans">
      <div className="w-full max-w-5xl space-y-8">
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

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-900">
            <p className="font-semibold">Consultar cadastros no banco</p>
            <p className="mt-2">Fornecedores, clientes, faturados, despesas, receitas, movimentos e parcelas.</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
              <button
                type="button"
                onClick={() => handleVerifyDatabase('all')}
                disabled={isVerifying}
                className={`rounded-xl px-4 py-3 font-semibold text-white transition ${selectedListType === 'all' ? 'bg-slate-900' : 'bg-slate-700 hover:bg-slate-800'} ${isVerifying ? 'opacity-70 cursor-not-allowed' : ''}`}
              >
                Todos
              </button>
              <button
                type="button"
                onClick={() => handleVerifyDatabase('fornecedor')}
                disabled={isVerifying}
                className={`rounded-xl px-4 py-3 font-semibold text-white transition ${selectedListType === 'fornecedor' ? 'bg-slate-900' : 'bg-slate-700 hover:bg-slate-800'} ${isVerifying ? 'opacity-70 cursor-not-allowed' : ''}`}
              >
                Fornecedores
              </button>
              <button
                type="button"
                onClick={() => handleVerifyDatabase('cliente')}
                disabled={isVerifying}
                className={`rounded-xl px-4 py-3 font-semibold text-white transition ${selectedListType === 'cliente' ? 'bg-slate-900' : 'bg-slate-700 hover:bg-slate-800'} ${isVerifying ? 'opacity-70 cursor-not-allowed' : ''}`}
              >
                Clientes
              </button>
              <button
                type="button"
                onClick={() => handleVerifyDatabase('faturado')}
                disabled={isVerifying}
                className={`rounded-xl px-4 py-3 font-semibold text-white transition ${selectedListType === 'faturado' ? 'bg-slate-900' : 'bg-slate-700 hover:bg-slate-800'} ${isVerifying ? 'opacity-70 cursor-not-allowed' : ''}`}
              >
                Faturados
              </button>
              <button
                type="button"
                onClick={() => handleVerifyDatabase('despesa')}
                disabled={isVerifying}
                className={`rounded-xl px-4 py-3 font-semibold text-white transition ${selectedListType === 'despesa' ? 'bg-slate-900' : 'bg-slate-700 hover:bg-slate-800'} ${isVerifying ? 'opacity-70 cursor-not-allowed' : ''}`}
              >
                Despesas
              </button>
              <button
                type="button"
                onClick={() => handleVerifyDatabase('receita')}
                disabled={isVerifying}
                className={`rounded-xl px-4 py-3 font-semibold text-white transition ${selectedListType === 'receita' ? 'bg-slate-900' : 'bg-slate-700 hover:bg-slate-800'} ${isVerifying ? 'opacity-70 cursor-not-allowed' : ''}`}
              >
                Receitas
              </button>
              <button
                type="button"
                onClick={() => handleVerifyDatabase('movimento')}
                disabled={isVerifying}
                className={`rounded-xl px-4 py-3 font-semibold text-white transition ${selectedListType === 'movimento' ? 'bg-slate-900' : 'bg-slate-700 hover:bg-slate-800'} ${isVerifying ? 'opacity-70 cursor-not-allowed' : ''}`}
              >
                Movimentos
              </button>
              <button
                type="button"
                onClick={() => handleVerifyDatabase('parcela')}
                disabled={isVerifying}
                className={`rounded-xl px-4 py-3 font-semibold text-white transition ${selectedListType === 'parcela' ? 'bg-slate-900' : 'bg-slate-700 hover:bg-slate-800'} ${isVerifying ? 'opacity-70 cursor-not-allowed' : ''}`}
              >
                Parcelas
              </button>
            </div>
            {verifyError && (
              <p className="mt-3 text-sm text-red-600">{verifyError}</p>
            )}
          </div>

          {verificationData && (
            <DatabaseViewer
              data={verificationData}
              onToggleStatus={handleToggleStatus}
              statusUpdateLoading={statusUpdateLoading}
            />
          )}

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
    </div>
  );
}

export default App;

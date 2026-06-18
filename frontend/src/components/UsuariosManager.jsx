import { useState, useEffect } from 'react';

export default function UsuariosManager({ apiBaseUrl }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [newUser, setNewUser] = useState({ nome: '', email: '', senha: '' });
  const [creating, setCreating] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBaseUrl}/users?all=true`, {
        credentials: 'include'
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `Erro ao buscar usuários (${res.status})`);
      }
      let data;
      try {
        data = await res.json();
      } catch (jsonErr) {
        const txt = await res.text();
        throw new Error(`Resposta inesperada: ${txt}`);
      }
      setUsers(data);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`${apiBaseUrl}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(newUser)
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `Erro ao criar usuário (${res.status})`);
      }
      await fetchUsers();
      setNewUser({ nome: '', email: '', senha: '' });
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const toggleStatus = async (id, currentStatus) => {
    const action = currentStatus === 'ATIVO' ? 'desativar' : 'reativar';
    const method = currentStatus === 'ATIVO' ? 'DELETE' : 'PATCH';
    const url = currentStatus === 'ATIVO'
      ? `${apiBaseUrl}/users/${id}`
      : `${apiBaseUrl}/users/${id}/reactivate`;
    try {
      const res = await fetch(url, { method, credentials: 'include' });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `Erro ao ${action} usuário (${res.status})`);
      }
      await fetchUsers();
    } catch (err) {
      console.error(err);
      setError(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <header className="text-center">
        <h1 className="text-3xl font-bold text-gray-800">Gerenciar Usuários</h1>
      </header>

      {/* Formulário de criação de usuário */}
      <section className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4 shadow-lg backdrop-filter backdrop-blur-sm">
        <h2 className="text-sm font-bold uppercase text-indigo-700 mb-2">Criar Usuário</h2>
        <form onSubmit={handleCreate} className="grid gap-3">
          <input
            type="text"
            placeholder="Nome"
            value={newUser.nome}
            onChange={(e) => setNewUser({ ...newUser, nome: e.target.value })}
            required
            className="rounded border p-2 bg-white/80"
            disabled={creating}
          />
          <input
            type="email"
            placeholder="Email"
            value={newUser.email}
            onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
            required
            className="rounded border p-2 bg-white/80"
            disabled={creating}
          />
          <input
            type="password"
            placeholder="Senha"
            value={newUser.senha}
            onChange={(e) => setNewUser({ ...newUser, senha: e.target.value })}
            required
            className="rounded border p-2 bg-white/80"
            disabled={creating}
          />
          <button
            type="submit"
            disabled={creating}
            className="rounded bg-indigo-600 text-white px-4 py-2 hover:bg-indigo-700 transition"
          >
            {creating ? 'Criando...' : 'Criar Usuário'}
          </button>
        </form>
      </section>

      {/* Tabela de usuários */}
      <section className="overflow-x-auto">
        {error && <p className="text-red-600 mb-2">{error}</p>}
        {loading ? (
          <p>Carregando...</p>
        ) : (
          <table className="min-w-full divide-y divide-gray-200 bg-white/90 backdrop-filter backdrop-blur-sm rounded-lg overflow-hidden">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">ID</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Nome</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Email</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Status</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-2 text-sm text-gray-800">{u.id}</td>
                  <td className="px-4 py-2 text-sm text-gray-800">{u.nome}</td>
                  <td className="px-4 py-2 text-sm text-gray-800 break-all">{u.email}</td>
                  <td className="px-4 py-2 text-sm text-gray-800">{u.status}</td>
                  <td className="px-4 py-2">
                    {u.status === 'ATIVO' ? (
                      <button
                        onClick={() => toggleStatus(u.id, 'ATIVO')}
                        className="rounded bg-rose-600 text-white px-2 py-1 text-sm hover:bg-rose-700 transition"
                      >
                        Desativar
                      </button>
                    ) : (
                      <button
                        onClick={() => toggleStatus(u.id, 'INATIVO')}
                        className="rounded bg-emerald-600 text-white px-2 py-1 text-sm hover:bg-emerald-700 transition"
                      >
                        Reativar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

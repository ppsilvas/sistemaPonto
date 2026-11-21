import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '../components/AppLayout';
import { AlterarSenhaPage } from '../features/auth/AlterarSenhaPage';
import { LoginPage } from '../features/auth/LoginPage';
import { HistoricoPage } from '../features/historico/HistoricoPage';
import { PontoPage } from '../features/ponto/PontoPage';
import { ProjetosPage } from '../features/projetos/ProjetosPage';
import { UsuariosPage } from '../features/usuarios/UsuariosPage';
import { AdminRoute, PrivateRoute } from './RouteGuards';

function PlaceholderPage({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <section className="card">
      <h1>{title}</h1>
      <p>{description}</p>
    </section>
  );
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<PrivateRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/ponto" element={<PontoPage />} />
          <Route path="/historico" element={<HistoricoPage />} />
          <Route path="/alterar-senha" element={<AlterarSenhaPage />} />

          <Route element={<AdminRoute />}>
            <Route
              path="/relatorios"
              element={
                <PlaceholderPage
                  title="Relatório de Pontos"
                  description="Consulta global, auditoria e exportação CSV."
                />
              }
            />
            <Route path="/projetos" element={<ProjetosPage />} />
            <Route path="/usuarios" element={<UsuariosPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/ponto" replace />} />
    </Routes>
  );
}

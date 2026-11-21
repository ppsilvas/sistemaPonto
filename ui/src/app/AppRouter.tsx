import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '../components/AppLayout';
import { AlterarSenhaPage } from '../features/auth/AlterarSenhaPage';
import { LoginPage } from '../features/auth/LoginPage';
import { HistoricoPage } from '../features/historico/HistoricoPage';
import { PontoPage } from '../features/ponto/PontoPage';
import { ProjetosPage } from '../features/projetos/ProjetosPage';
import { RelatoriosPage } from '../features/relatorios/RelatoriosPage';
import { UsuariosPage } from '../features/usuarios/UsuariosPage';
import { AdminRoute, PrivateRoute } from './RouteGuards';

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
            <Route path="/relatorios" element={<RelatoriosPage />} />
            <Route
              path="/relatórios"
              element={<Navigate to="/relatorios" replace />}
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

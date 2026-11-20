import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '../components/AppLayout';
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
      <Route
        path="/login"
        element={
          <PlaceholderPage
            title="Entrar no Ponto Lelê"
            description="Tela de autenticação será implementada em UC-01."
          />
        }
      />

      <Route element={<PrivateRoute />}>
        <Route element={<AppLayout />}>
          <Route
            path="/ponto"
            element={
              <PlaceholderPage
                title="Registrar Ponto"
                description="Seleção de projeto, Start/Pause e cronômetro em tempo real."
              />
            }
          />
          <Route
            path="/historico"
            element={
              <PlaceholderPage
                title="Meu Histórico"
                description="Consulta de histórico de registros de ponto."
              />
            }
          />
          <Route
            path="/alterar-senha"
            element={
              <PlaceholderPage
                title="Alterar Senha"
                description="Atualização da própria senha."
              />
            }
          />

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
            <Route
              path="/projetos"
              element={
                <PlaceholderPage
                  title="Projetos"
                  description="Gestão de projetos e vínculos de usuários."
                />
              }
            />
            <Route
              path="/usuarios"
              element={
                <PlaceholderPage
                  title="Usuários"
                  description="Cadastro, edição e inativação de usuários."
                />
              }
            />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/ponto" replace />} />
    </Routes>
  );
}

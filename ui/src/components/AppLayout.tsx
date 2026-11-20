import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Clock,
  FileBarChart2,
  FolderKanban,
  History,
  KeyRound,
  LogOut,
  Users,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useAuth } from '../features/auth/AuthContext';
import { Badge } from './Badge';
import { Button } from './Button';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
}

const WORKER_NAV: NavItem[] = [
  { to: '/ponto', label: 'Registrar Ponto', icon: <Clock size={18} /> },
  { to: '/historico', label: 'Meu Histórico', icon: <History size={18} /> },
];

const ADMIN_NAV: NavItem[] = [
  { to: '/ponto', label: 'Registrar Ponto', icon: <Clock size={18} /> },
  { to: '/relatorios', label: 'Relatório de Pontos', icon: <FileBarChart2 size={18} /> },
  { to: '/projetos', label: 'Projetos', icon: <FolderKanban size={18} /> },
  { to: '/usuarios', label: 'Usuários', icon: <Users size={18} /> },
];

export function AppLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const isAdmin = user?.perfil === 'admin';
  const navItems = isAdmin ? ADMIN_NAV : WORKER_NAV;

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-brand">
          <Clock size={22} aria-hidden="true" />
          <span>Ponto Lelê</span>
        </div>

        <div className="app-user-bar">
          {user ? (
            <>
              <span>{user.nome}</span>
              <Badge variant={isAdmin ? 'admin' : 'worker'}>
                {isAdmin ? 'Admin' : 'Worker'}
              </Badge>
            </>
          ) : null}
          <Button
            variant="ghost"
            onClick={() => navigate('/alterar-senha')}
            aria-label="Alterar senha"
          >
            <KeyRound size={16} aria-hidden="true" />
            <span>Alterar senha</span>
          </Button>
          <Button variant="secondary" onClick={handleSignOut} aria-label="Sair">
            <LogOut size={16} aria-hidden="true" />
            <span>Sair</span>
          </Button>
        </div>
      </header>

      <div className="app-body">
        <aside className="app-sidebar" aria-label="Navegação principal">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                ['nav-link', isActive ? 'nav-link-active' : '']
                  .filter(Boolean)
                  .join(' ')
              }
            >
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          ))}
        </aside>

        <main className="app-main">
          <Outlet />
        </main>
      </div>

      <nav className="app-mobile-nav" aria-label="Navegação mobile">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              ['nav-link', isActive ? 'nav-link-active' : '']
                .filter(Boolean)
                .join(' ')
            }
          >
            {item.icon}
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

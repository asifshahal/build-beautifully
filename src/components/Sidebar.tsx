import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Flame, BarChart3, Send, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react';

const navItems = [
  { label: 'DLMM Hot Pools', icon: Flame, path: '/dlmm-hot-pools', external: false },
];

const externalLinks = [
  { label: 'Charting', icon: BarChart3, url: 'https://citchartanalyzer.app' },
  { label: 'Telegram', icon: Send, url: 'https://t.me/citchartanalyzer' },
  { label: 'X (Twitter)', icon: ExternalLink, url: 'https://x.com/citchartanalyzer' },
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  return (
    <aside
      className={`fixed top-0 left-0 h-full bg-secondary border-r border-border z-40 transition-all duration-300 flex flex-col ${
        collapsed ? 'w-12' : 'w-[220px]'
      }`}
    >
      {/* Logo */}
      <div className="h-[60px] flex items-center px-3 border-b border-border">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <img src="/logo.jpeg" alt="CitLab's Logo" className="h-7 w-auto object-contain" />
            <span className="text-foreground font-bold text-lg tracking-tight">
              CitLab's
            </span>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="ml-auto p-1 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 space-y-0.5 px-2">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-150 group ${
                isActive
                  ? 'bg-accent text-accent-foreground border-l-[3px] border-primary'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground border-l-[3px] border-transparent'
              }`}
            >
              <item.icon size={18} className={isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'} />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}

        {/* Divider */}
        <div className="my-3 mx-3 border-t border-border" />

        {externalLinks.map((item) => (
          <a
            key={item.url}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-all duration-150 border-l-[3px] border-transparent"
          >
            <item.icon size={18} />
            {!collapsed && (
              <>
                <span>{item.label}</span>
                <ExternalLink size={12} className="ml-auto opacity-50" />
              </>
            )}
          </a>
        ))}
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div className="px-4 py-3 border-t border-border">
          <p className="text-[10px] text-muted-foreground leading-tight">
            citchartanalyzer.app
          </p>
        </div>
      )}
    </aside>
  );
}

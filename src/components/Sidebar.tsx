import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Flame, BarChart3, Send, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (val: boolean) => void;
}

const navItems = [
  { label: 'DLMM Hot Pools', icon: Flame, path: '/dlmm-hot-pools', external: false },
];

const externalLinks = [
  { label: 'Charting', icon: BarChart3, url: 'https://citchartanalyzer.app' },
  { label: 'Telegram', icon: Send, url: 'https://t.me/citchartanalyzer' },
  { label: 'X (Twitter)', icon: ExternalLink, url: 'https://x.com/citchartanalyzer' },
];

export default function Sidebar({ isOpen, setIsOpen }: SidebarProps) {
  const isMobile = useIsMobile();
  const location = useLocation();

  useEffect(() => {
    if (isMobile) setIsOpen(false);
  }, [location.pathname, isMobile, setIsOpen]);

  const sidebarWidthClass = isMobile
    ? (isOpen ? 'w-[220px] translate-x-0' : 'w-[220px] -translate-x-full')
    : (isOpen ? 'w-[220px] translate-x-0' : 'w-12 translate-x-0');

  return (
    <aside
      className={`fixed top-0 left-0 h-full bg-secondary border-r border-border z-40 transition-all duration-300 flex flex-col ${sidebarWidthClass}`}
    >
      {/* Logo */}
      <div className="h-[60px] flex items-center px-3 border-b border-border overflow-hidden">
        {isOpen && (
          <div className="flex items-center gap-2 min-w-0">
            <img src="/logo.jpeg" alt="CitLab's Logo" className="h-7 w-auto object-contain flex-shrink-0" />
            <span className="text-foreground font-bold text-lg tracking-tight truncate">
              CitLab's
            </span>
          </div>
        )}
        {!isMobile && (
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="ml-auto p-1 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground shrink-0"
            aria-label={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {isOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
          </button>
        )}
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
              {isOpen && <span>{item.label}</span>}
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
            {isOpen && (
              <>
                <span>{item.label}</span>
                <ExternalLink size={12} className="ml-auto opacity-50" />
              </>
            )}
          </a>
        ))}
      </nav>

      {/* Footer */}
      {isOpen && (
        <div className="px-4 py-3 border-t border-border">
          <p className="text-[10px] text-muted-foreground leading-tight">
            citchartanalyzer.app
          </p>
        </div>
      )}
    </aside>
  );
}

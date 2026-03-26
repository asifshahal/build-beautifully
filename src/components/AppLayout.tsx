import { ReactNode, useState, useEffect } from 'react';
import { Menu } from 'lucide-react';
import Sidebar from './Sidebar';
import { useIsMobile } from '@/hooks/use-mobile';

interface AppLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
}

export default function AppLayout({ children, title, subtitle }: AppLayoutProps) {
  const isMobile = useIsMobile();
  const [isSidebarOpen, setIsSidebarOpen] = useState(!isMobile);

  useEffect(() => {
    setIsSidebarOpen(!isMobile);
  }, [isMobile]);

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />
      
      {/* Mobile Overlay */}
      {isMobile && isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-30" 
          onClick={() => setIsSidebarOpen(false)} 
        />
      )}

      {/* Main content area — offset by sidebar width */}
      <div className={`flex-1 transition-all duration-300 min-h-screen ${isMobile ? 'ml-0' : (isSidebarOpen ? 'ml-[220px]' : 'ml-12')}`}>
        {/* Header */}
        <header className="h-[60px] border-b border-border flex items-center px-6 bg-secondary/50 backdrop-blur-sm sticky top-0 z-30 gap-4">
          {isMobile && (
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 -ml-2 rounded-md hover:bg-accent text-foreground"
            >
              <Menu size={20} />
            </button>
          )}
          <div>
            <h1 className="text-foreground font-semibold text-base leading-tight">{title}</h1>
            {subtitle && <p className="text-muted-foreground text-xs">{subtitle}</p>}
          </div>
        </header>

        {/* Content */}
        <main className="p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

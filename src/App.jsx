import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
// Add page imports here
import Home from '@/pages/Home';
import Discovery from '@/pages/Discovery';
import Library from '@/pages/Library';
import Trophies from '@/pages/Trophies';
import Settings from '@/pages/Settings';
import ContentDetail from '@/pages/ContentDetail';
import FranchiseDetail from '@/pages/FranchiseDetail';

const AuthenticatedApp = () => {
  const { isLoadingPublicSettings } = useAuth();

  // Framory is a personal, no-account app. Just wait for public settings, then render.
  if (isLoadingPublicSettings) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/discovery" element={<Discovery />} />
      <Route path="/library" element={<Library />} />
      <Route path="/trophies" element={<Trophies />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/content/:id" element={<ContentDetail />} />
      <Route path="/franchise/:id" element={<FranchiseDetail />} />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
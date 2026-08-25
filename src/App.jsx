import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import ScrollToTop from './components/ScrollToTop';
import Home from '@/pages/Home';
import Discovery from '@/pages/Discovery';
import Library from '@/pages/Library';
import Trophies from '@/pages/Trophies';
import Settings from '@/pages/Settings';
import ContentDetail from '@/pages/ContentDetail';
import FranchiseDetail from '@/pages/FranchiseDetail';

function App() {
  return (
    <QueryClientProvider client={queryClientInstance}>
      <Router>
        <ScrollToTop />
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
      </Router>
      <Toaster />
    </QueryClientProvider>
  )
}

export default App

import { lazy, useEffect, useState, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'

import { ErrorBoundary } from './components/ErrorBoundary'
import { Navbar } from './components/Navbar'
import { SiteFooter } from './components/SiteFooter'
import { Spinner } from './components/ui'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { ToastProvider } from './components/Toast'
import { apiGet } from './lib/apiClient'
import type { SetupStatusResponse } from './types/api'

const Home = lazy(() => import('./pages/Home'))
const Gallery = lazy(() => import('./pages/Gallery'))
const GalleryDetail = lazy(() => import('./pages/GalleryDetail'))
const Keycaps = lazy(() => import('./pages/Keycaps'))
const KeycapDetail = lazy(() => import('./pages/KeycapDetail'))
const CheckIn = lazy(() => import('./pages/CheckIn'))
const Login = lazy(() => import('./pages/Login'))
const Register = lazy(() => import('./pages/Register'))
const Me = lazy(() => import('./pages/Me'))
const Setup = lazy(() => import('./pages/Setup'))
const NotFound = lazy(() => import('./pages/NotFound'))
const AdminRoutes = lazy(() => import('./pages/admin/AdminRoutes'))

function PageFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Spinner label="加载中" />
    </div>
  )
}

function AppShell() {
  const location = useLocation()
  const { user, loading: authLoading } = useAuth()
  const [setupStatus, setSetupStatus] = useState<SetupStatusResponse | null>(null)

  useEffect(() => {
    let active = true
    apiGet<SetupStatusResponse>('/api/setup/status')
      .then((status) => {
        if (active) setSetupStatus(status)
      })
      .catch(() => {
        if (active) setSetupStatus({ initialized: true, requiresSetup: false })
      })
    return () => {
      active = false
    }
  }, [])

  const isAdminRoute = location.pathname === '/admin' || location.pathname.startsWith('/admin/')
  const isSetupRoute = location.pathname === '/setup'

  if (authLoading || setupStatus === null) {
    return <PageFallback />
  }

  if (setupStatus.requiresSetup && !isSetupRoute && !user) {
    return <Navigate to="/setup" replace />
  }

  if (!setupStatus.requiresSetup && isSetupRoute) {
    return <Navigate to="/" replace />
  }

  const content = (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/gallery" element={<Gallery />} />
        <Route path="/gallery/:galleryId" element={<GalleryDetail />} />
        <Route path="/keycaps" element={<Keycaps />} />
        <Route path="/keycaps/:keycapId" element={<KeycapDetail />} />
        <Route path="/check-in" element={<CheckIn />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/me" element={<Me />} />
        <Route path="/setup" element={<Setup />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  )

  if (isAdminRoute || isSetupRoute) {
    return (
      <ErrorBoundary>
        <Suspense fallback={<PageFallback />}>{isAdminRoute ? <AdminRoutes /> : content}</Suspense>
      </ErrorBoundary>
    )
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1 qq-paper-texture">
        <ErrorBoundary>{content}</ErrorBoundary>
      </main>
      <SiteFooter />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <AppShell />
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}

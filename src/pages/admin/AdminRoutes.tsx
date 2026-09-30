import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import { ErrorBoundary } from '../../components/ErrorBoundary'
import { RouteGuard } from '../../components/RouteGuard'
import { Spinner } from '../../components/ui'
import AdminLayout from './AdminLayout'

const AdminDashboard = lazy(() => import('./AdminDashboard'))
const AdminGalleries = lazy(() => import('./AdminGalleries'))
const AdminGalleryEdit = lazy(() => import('./AdminGalleryEdit'))
const AdminKeycaps = lazy(() => import('./AdminKeycaps'))
const AdminKeycapEdit = lazy(() => import('./AdminKeycapEdit'))
const AdminUsers = lazy(() => import('./AdminUsers'))
const AdminSettings = lazy(() => import('./AdminSettings'))

function AdminFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Spinner label="加载中" />
    </div>
  )
}

export default function AdminRoutes() {
  return (
    <RouteGuard requireAdmin>
      <ErrorBoundary>
        <Suspense fallback={<AdminFallback />}>
          <Routes>
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<AdminDashboard />} />
              <Route path="galleries" element={<AdminGalleries />} />
              <Route path="galleries/new" element={<AdminGalleryEdit />} />
              <Route path="galleries/:galleryId/edit" element={<AdminGalleryEdit />} />
              <Route path="keycaps" element={<AdminKeycaps />} />
              <Route path="keycaps/new" element={<AdminKeycapEdit />} />
              <Route path="keycaps/:keycapId/edit" element={<AdminKeycapEdit />} />
              <Route
                path="users"
                element={
                  <RouteGuard requireSuperAdmin>
                    <AdminUsers />
                  </RouteGuard>
                }
              />
              <Route
                path="settings"
                element={
                  <RouteGuard requireSuperAdmin>
                    <AdminSettings />
                  </RouteGuard>
                }
              />
              <Route path="*" element={<Navigate to="/admin" replace />} />
            </Route>
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </RouteGuard>
  )
}

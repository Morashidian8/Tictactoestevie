import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import Shell from '@/components/Shell'
import { Skeleton } from '@/components/ui'
import { applyTheme, useSettings } from '@/store/settings'
import { useProgress } from '@/store/progress'

const Home = lazy(() => import('@/pages/Home'))
const Onboarding = lazy(() => import('@/pages/Onboarding'))
const Library = lazy(() => import('@/pages/Library'))
const GradePage = lazy(() => import('@/pages/GradePage'))
const LessonPage = lazy(() => import('@/pages/LessonPage'))
const Review = lazy(() => import('@/pages/Review'))
const ProgressPage = lazy(() => import('@/pages/ProgressPage'))
const Profile = lazy(() => import('@/pages/Profile'))
const SearchPage = lazy(() => import('@/pages/SearchPage'))
const Paywall = lazy(() => import('@/pages/Paywall'))
const ExamBuilder = lazy(() => import('@/pages/ExamBuilder'))

function Loading() {
  return (
    <div className="space-y-3 p-4">
      <Skeleton className="h-28" />
      <Skeleton className="h-20" />
      <Skeleton className="h-20" />
    </div>
  )
}

export default function App() {
  const theme = useSettings((s) => s.theme)
  const onboarded = useSettings((s) => s.onboarded)
  const touch = useProgress((s) => s.touch)
  const location = useLocation()

  useEffect(() => applyTheme(theme), [theme])
  useEffect(() => { touch() }, [touch])
  useEffect(() => { window.scrollTo({ top: 0 }) }, [location.pathname])

  if (!onboarded && location.pathname !== '/welcome') {
    return (
      <Suspense fallback={<Loading />}>
        <Onboarding />
      </Suspense>
    )
  }

  return (
    <Shell>
      <Suspense fallback={<Loading />}>
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            <Routes location={location}>
              <Route path="/" element={<Home />} />
              <Route path="/library" element={<Library />} />
              <Route path="/grade/:grade" element={<GradePage />} />
              <Route path="/lesson/:id" element={<LessonPage />} />
              <Route path="/lesson/:id/:tab" element={<LessonPage />} />
              <Route path="/review" element={<Review />} />
              <Route path="/exam-builder" element={<ExamBuilder />} />
              <Route path="/progress" element={<ProgressPage />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/premium" element={<Paywall />} />
              <Route path="/welcome" element={<Onboarding />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </motion.div>
        </AnimatePresence>
      </Suspense>
    </Shell>
  )
}

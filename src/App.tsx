import { Route, Routes, useParams } from 'react-router'
import { AppShell } from './components/AppShell'
import { ErrorBoundary } from './components/ErrorBoundary'
import { LoginScreen } from './components/LoginScreen'
import { NotFoundPage } from './components/NotFoundPage'
import { SessionSentinel } from './components/SessionSentinel'
import { useAuth } from './auth/useAuth'
import { TriggerListPage } from './features/triggers/TriggerListPage'
import { TriggerReviewPage } from './features/triggers/TriggerReviewPage'
import { DecisionQueueProvider } from './features/triggers/DecisionQueueProvider'
import { TriggersProvider } from './features/triggers/TriggersProvider'
import { StationsProvider } from './features/stations/StationsProvider'

/**
 * The review page, reset per trigger, so a payload that breaks the page for
 * one trigger does not leave the error showing on the next.
 */
function ReviewRoute() {
  const { triggerId } = useParams()
  return (
    <ErrorBoundary label="This trigger" resetKey={triggerId}>
      <TriggerReviewPage />
    </ErrorBoundary>
  )
}

export default function App() {
  const { status } = useAuth()

  /**
   * Signed out, every address shows the login screen - and the address itself
   * is left alone. The token lives only in memory, so a refresh on a trigger
   * lands here; keeping the URL means signing in puts the analyst back on it.
   */
  if (status === 'anonymous') {
    return <LoginScreen />
  }

  // `expired` still renders the app: the lock sits over it so the analyst's
  // place survives signing back in.
  return (
    <>
      {/* Station locations load once, as soon as the analyst is signed in:
          they change on the scale of months, and distance ordering wants
          them ready before the first trigger is opened. */}
      <StationsProvider>
        {/* Above the router: the list outlives any one page, so opening a
            trigger and coming back does not re-fetch it. */}
        <TriggersProvider>
          {/* Inside the trigger list, which it hides decided triggers from;
              above the routes, so a decision outlives the page it was made on. */}
          <DecisionQueueProvider>
            <AppShell>
              <Routes>
                <Route
                  path="/"
                  element={
                    <ErrorBoundary label="The trigger list">
                      <TriggerListPage />
                    </ErrorBoundary>
                  }
                />
                <Route path="/triggers/:triggerId" element={<ReviewRoute />} />
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </AppShell>
          </DecisionQueueProvider>
        </TriggersProvider>
      </StationsProvider>
      <SessionSentinel />
    </>
  )
}

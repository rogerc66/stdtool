import { useState, useEffect } from 'preact/hooks'
import Landing from './pages/Landing'
import Review from './pages/Review'
import Composer from './pages/Composer'

function getPage() {
  return location.hash.replace(/^#/, '') || 'landing'
}

export default function App() {
  const [page, setPage] = useState(getPage)

  useEffect(() => {
    const onHash = () => setPage(getPage())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const navigate = (p) => { location.hash = p }

  if (page === 'review')   return <Review navigate={navigate} />
  if (page === 'composer') return <Composer navigate={navigate} />
  return <Landing navigate={navigate} />
}

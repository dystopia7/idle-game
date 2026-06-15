import TopBar       from '../components/TopBar'
import LeftSidebar  from '../components/LeftSidebar'
import GameViewport from '../components/GameViewport'
import RightSidebar from '../components/RightSidebar'
import BottomChat   from '../components/BottomChat'

interface Props { token: string; onLogout: () => void }

export default function GameLayout({ token, onLogout }: Props) {
  return (
    <div className="app">
      <TopBar onLogout={onLogout} />
      <div className="main-row">
        <LeftSidebar />
        <div className="center-column">
          <GameViewport token={token} />
          <BottomChat />
        </div>
        <RightSidebar />
      </div>
    </div>
  )
}

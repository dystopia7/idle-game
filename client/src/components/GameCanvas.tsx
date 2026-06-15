import { useEffect, useRef } from 'react'
import Phaser from 'phaser'
import { BootScene }  from '../scenes/BootScene'
import { GameScene }  from '../scenes/GameScene'
import { setGameToken } from '../lib/gameBridge'

interface Props { token: string }

export default function GameCanvas({ token }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setGameToken(token)

    const game = new Phaser.Game({
      type:            Phaser.AUTO,
      parent:          mountRef.current!,
      backgroundColor: '#0c0f18',
      dom:             { createContainer: false },
      scene:           [BootScene, GameScene],
      pixelArt:        true,
      antialias:       false,
      scale: {
        mode:   Phaser.Scale.RESIZE,
        width:  '100%',
        height: '100%',
      },
    })

    return () => { game.destroy(true) }
  }, [token])

  return <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
}

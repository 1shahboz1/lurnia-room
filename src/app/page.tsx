'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    // Redirect to the room page
    router.push('/room')
  }, [router])

  return (
    <div className="h-screen w-full flex items-center justify-center bg-gray-100">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-4">AI Rooms 3D</h1>
        <p className="text-gray-600">Redirecting to your virtual room...</p>
      </div>
    </div>
  )
}
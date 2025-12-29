'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    // Redirect to the firewall scenario
    router.push('/firewall')
  }, [router])

  return (
    <div className="h-screen w-full flex items-center justify-center bg-gray-100">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-4">Lurnia Virtual Rooms</h1>
        <p className="text-gray-600">Loading virtual room...</p>
      </div>
    </div>
  )
}

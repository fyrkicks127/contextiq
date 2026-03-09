'use client'

import { useEffect, useState } from 'react'

export default function Home() {
  const [health, setHealth] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('http://localhost:3000/health')
      .then(res => res.json())
      .then(data => {
        setHealth(data)
        setLoading(false)
      })
      .catch(err => {
        console.error('Backend connection failed:', err)
        setLoading(false)
      })
  }, [])

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-5xl font-bold text-gray-900 mb-4">
        🚀 ContextIQ
        </h1>
        <p className="text-xl text-gray-600 mb-8">
          Less Tokens, More Value
        </p>

        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-2xl font-semibold mb-4">Backend Status</h2>
          {loading ? (
            <p className="text-gray-500">Checking backend...</p>
          ) : health ? (
            <div className="space-y-2">
              <p className="text-green-600 font-semibold">✅ Connected</p>
              <pre className="bg-gray-100 p-4 rounded text-sm overflow-x-auto">
                {JSON.stringify(health, null, 2)}
              </pre>
            </div>
          ) : (
            <p className="text-red-600">❌ Backend not responding</p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="font-semibold mb-2">Frontend</h3>
            <p className="text-green-600">✅ Running</p>
            <p className="text-sm text-gray-500">Port 3001</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="font-semibold mb-2">Backend</h3>
            <p className={health ? "text-green-600" : "text-red-600"}>
              {health ? "✅ Running" : "❌ Offline"}
            </p>
            <p className="text-sm text-gray-500">Port 3000</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="font-semibold mb-2">Database</h3>
            <p className="text-green-600">✅ Running</p>
            <p className="text-sm text-gray-500">PostgreSQL</p>
          </div>
        </div>
      </div>
    </main>
  )
}
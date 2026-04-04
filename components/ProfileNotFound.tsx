'use client'

interface ProfileNotFoundProps {
  error?: string
}

export default function ProfileNotFound({ error }: ProfileNotFoundProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full p-8 bg-white rounded-lg shadow-md">
        <h2 className="text-2xl font-bold text-red-600 mb-4">Profile Not Found</h2>
        <p className="text-gray-700 mb-4">
          Your account exists but your profile wasn't created. This usually happens if:
        </p>
        <ul className="list-disc list-inside text-gray-600 mb-4 space-y-2">
          <li>The RLS policy migration wasn't run</li>
          <li>There was an error during signup</li>
        </ul>
        <p className="text-sm text-gray-600 mb-4">
          Error: {error || 'No profile found'}
        </p>
        <button
          onClick={() => window.location.href = '/login'}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Back to Login
        </button>
      </div>
    </div>
  )
}

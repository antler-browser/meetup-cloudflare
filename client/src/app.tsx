import { useState, useEffect, useCallback } from 'react'
import { decodeAndVerifyJWT } from '@meetup/shared'
import { IrlOnboarding } from 'irl-browser-onboarding/react'
import { QRCodePanel } from './components/QRCodePanel'
import { UserList } from './components/UserList'
import { UserDetail, type User } from './components/UserDetail'
import data from '../../data.json'

// TypeScript declarations for IRL Browser API
declare global {
  interface Window {
    irlBrowser?: {
      getProfileDetails(): Promise<string>;
      getAvatar(): Promise<string | null>;
      getBrowserDetails(): {
        name: string;
        version: string;
        platform: 'ios' | 'android' | 'browser';
        supportedPermissions: string[];
      };
      requestPermission(permission: string): Promise<boolean>;
      close(): void;
    };
  }
}


export function App() {
  const [profile, setProfile] = useState<User | null>(null)
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null) // null = loading
  const [showOnboardingModal, setShowOnboardingModal] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [users, setUsers] = useState<User[] | null>(null)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)

  // Handler for when onboarding completes - now window.irlBrowser is available
  const handleOnboardingComplete = useCallback(() => {
    setShowOnboardingModal(false)
    setShowOnboarding(false)
    loadProfile()
    loadAvatar()
  }, [])

  useEffect(() => {
    // Check if window.irlBrowser is available (native app or returning web user)
    const hasIrlBrowser = !!window.irlBrowser
    setShowOnboarding(!hasIrlBrowser)

    // Fetch all users from the database
    fetchUsers()

    // Connect to WebSocket for real-time updates
    const ws = connectToWebSocket()

    // Only load profile if IRL Browser is available
    if (hasIrlBrowser) {
      loadProfile()
      loadAvatar()
    }

    // Cleanup on unmount
    return () => {
      ws?.close()
    }
  }, [])

  const loadProfile = async () => {
    try {
      if (!window.irlBrowser) {
        console.log('IRL Browser not found')
        return
      }
      // Get profile details JWT
      const profileJwt = await window.irlBrowser.getProfileDetails()

      // Add user to the database
      addUserToDatabase(profileJwt)

      // Decode and verify the profile JWT
      const profilePayload = await decodeAndVerifyJWT(profileJwt)

      if (!profilePayload) {
        console.log('No profile found');
        return;
      }

      setProfile(profilePayload.data as User)

    } catch (err) {
      console.error('Error loading profile:', err)
      setError(err instanceof Error ? err.message : 'Failed to load profile')
    }
  }

  const loadAvatar = async () => {
    try {
      if (!window.irlBrowser) {
        return
      }
      // Get avatar separately (returns a signed JWT)
      const avatarJWT = await window.irlBrowser.getAvatar()
      if (!avatarJWT) { return }
      addAvatarToDatabase(avatarJWT)
    } catch (err) {
      console.error('Error loading avatar:', err)
      // Don't set error state for avatar failures, just log them
    }
  }

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/users')
      if (!response.ok) {
        throw new Error('Failed to fetch users')
      }
      const data = await response.json()
      const fetchedUsers = data.users as User[]

      // Merge fetched users with existing state (deduplicate by DID)
      setUsers((prev) => {
        const merged = [...(prev ?? [])] as User[]
        if (merged.length === 0) { return fetchedUsers } // If no users, return the fetched users
        for (const user of fetchedUsers) {
          const existingIndex = merged.findIndex((u) => u.did === user.did)
          if (existingIndex >= 0) {
            // Update existing user in place
            merged[existingIndex] = user
          } else {
            // Add new user to bottom
            merged.push(user)
          }
        }
        return merged
      })
    } catch (err) {
      console.error('Error fetching users:', err)
    }
  }

  const addUserToDatabase = async (profileJwt: string) => {
    try {
      const response = await fetch('/api/add-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ profileJwt }),
      })

      if (!response.ok) {
        throw new Error('Failed to check in')
      }

      await response.json()
    } catch (err) {
      console.error('Error adding user to database:', err)
      // Don't show error to user, they'll still see the user list
    }
  }

  const addAvatarToDatabase = async (avatarJwt: string) => {
    try {
      const response = await fetch('/api/add-avatar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ avatarJwt }),
      })

      if (!response.ok) {
        throw new Error('Failed to check in')
      }

      await response.json()
    } catch (err) {
      console.error('Error adding user to database:', err)
      // Don't show error to user, they'll still see the user list
    }
  }

  const connectToWebSocket = () => {
    try {
      // Construct WebSocket URL
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${protocol}//${window.location.host}/api/ws`

      const ws = new WebSocket(wsUrl)

      ws.onopen = () => {
        console.log('WebSocket connected')
      }

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)

          switch (message.type) {
            case 'connected':
              console.log('Connected to meetup broadcaster:', message)
              break

            case 'user-joined':
              const user = message.data as User

              // Add or update user in the list
              setUsers((prev) => {
                const merged = [...(prev ?? [])] as User[]
                const exists = merged.find((u) => u.did === user.did)
                if (exists) {
                  // Update existing user in place (keep position)
                  return merged.map((u) => (u.did === user.did ? user : u))
                } else {
                  // Add new user to bottom
                  return [...merged, user]  
                }
              })
              break

            case 'user-left':
              const { did } = message.data as { did: string }

              // Remove user from the list
              setUsers((prev) => prev?.filter((u) => u.did !== did) ?? [])

              // If the selected user left, clear the selection
              setSelectedUser((prev) => (prev?.did === did ? null : prev))
              break

            case 'meetup-ended':
              console.log('Meetup ended:', message.data)
              // Optionally show a message to the user
              break

            default:
              console.log('Unknown message type:', message.type)
          }
        } catch (err) {
          console.error('Error parsing WebSocket message:', err)
        }
      }

      ws.onerror = (error) => {
        console.error('WebSocket error:', error)
      }

      ws.onclose = (event) => {
        console.log('WebSocket closed:', event.code, event.reason)
        // Optionally implement reconnection logic here
      }

      return ws
    } catch (err) {
      console.error('Error connecting to WebSocket:', err)
      return null
    }
  }

  // Show loading state while waiting for users
  if (!users) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50">
        <div className="grid md:grid-cols-2 min-h-screen">
          <QRCodePanel />
          <div className="flex items-center justify-center px-4"></div>
        </div>
      </div>
    )
  }

  // Show error state
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50">
        <div className="grid md:grid-cols-2 min-h-screen">
          <QRCodePanel />
          <div className="flex items-center justify-center px-4">
            <div className="text-center max-w-md">
              <div className="text-6xl mb-6">⚠️</div>
              <h1 className="text-3xl font-bold mb-4 text-gray-800">Error</h1>
              <p className="text-gray-600">{error}</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Show user detail if a user is selected
  if (selectedUser) {
    return (
      <UserDetail
        user={selectedUser}
        onBack={() => setSelectedUser(null)}
        isCurrentUser={profile?.did === selectedUser.did}
        getProfileJwt={async () => await window.irlBrowser?.getProfileDetails()}
      />
    )
  }

  // Show attendee list
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50">
      <div className="grid md:grid-cols-2 min-h-screen">
        <QRCodePanel />
        <div className="flex px-4 py-8 pb-24">
          <div className="w-full max-w-2xl mx-auto mt-10">
            <div className="text-center mb-8">
              <h1 className="text-4xl font-bold mb-6 text-gray-800">
                Hey! {data.title}
              </h1>
            </div>

            {/* User List */}
            <div className="mt-6">
              <UserList users={users} onUserClick={(user) => setSelectedUser(user)} />
            </div>
          </div>
        </div>
      </div>

      {/* Floating "Add yourself" button for mobile users without IRL Browser */}
      {showOnboarding && (
        <button
          onClick={() => setShowOnboardingModal(true)}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#403B51] text-white px-8 py-4 rounded-full shadow-lg hover:bg-[#322d40] transition-all hover:scale-105 font-semibold text-lg z-40 md:hidden"
        >
          Add yourself
        </button>
      )}

      {/* Onboarding modal */}
      {showOnboardingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowOnboardingModal(false)}
          />
          {/* Modal content */}
          <div className="relative z-10 w-full max-w-lg mx-4 max-h-[90vh] overflow-auto rounded-2xl shadow-2xl">
            <IrlOnboarding
              mode="choice"
              onComplete={handleOnboardingComplete}
              customStyles={{ primaryColor: '#403B51' }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

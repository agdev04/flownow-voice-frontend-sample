"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { onAuthStateChanged } from "firebase/auth"
import { auth } from "@/lib/firebase"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Copy, LogOut, MessageSquare } from "lucide-react"
import { signOut } from "firebase/auth"

export default function Dashboard() {
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [copying, setCopying] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        // User is signed in, get the token
        user
          .getIdToken(/* forceRefresh */ true)
          .then((idToken) => {
            // Store token in localStorage for WebSocket use
            localStorage.setItem("firebaseToken", idToken)
            setToken(idToken)
            setLoading(false)
          })
          .catch((error) => {
            console.error("Error getting token:", error)
            setLoading(false)
          })
      } else {
        // User is signed out
        router.push("/login")
      }
    })

    return () => unsubscribe()
  }, [router])

  const handleCopyToken = async () => {
    if (token) {
      try {
        await navigator.clipboard.writeText(token)
        setCopying(true)
        setTimeout(() => setCopying(false), 2000)
      } catch (err) {
        console.error("Failed to copy token:", err)
      }
    }
  }

  const handleLogout = async () => {
    try {
      // Clear token from localStorage
      localStorage.removeItem("firebaseToken")
      await signOut(auth)
      router.push("/login")
    } catch (error) {
      console.error("Error signing out:", error)
    }
  }

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle>Dashboard</CardTitle>
        <CardDescription>You are now logged in. Here is your Firebase ID token.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Your Firebase ID Token:</h3>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ) : (
            <div className="relative">
              <pre className="p-4 bg-muted rounded-md overflow-auto text-xs max-h-60">{token}</pre>
              <Button size="sm" variant="outline" className="absolute top-2 right-2" onClick={handleCopyToken}>
                {copying ? "Copied!" : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          )}
        </div>
        <div className="bg-muted p-4 rounded-md">
          <p className="text-sm">
            This token can be used to authenticate requests to your backend services. It contains claims about the user
            and is signed by Firebase.
          </p>
        </div>
        <div className="flex justify-center">
          <Button variant="outline" asChild>
            <Link href="/chat">
              <MessageSquare className="mr-2 h-4 w-4" /> Open WebSocket Chat
            </Link>
          </Button>
        </div>
      </CardContent>
      <CardFooter>
        <Button variant="outline" onClick={handleLogout} className="ml-auto">
          <LogOut className="mr-2 h-4 w-4" /> Sign Out
        </Button>
      </CardFooter>
    </Card>
  )
}

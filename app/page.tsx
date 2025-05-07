import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <h1 className="text-3xl font-bold">Firebase Authentication Demo</h1>
        <p className="text-muted-foreground">A simple demo of Firebase Authentication with Next.js</p>
        <div className="space-y-3">
          <Button asChild className="w-full">
            <Link href="/login">Log In</Link>
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link href="/signup">Sign Up</Link>
          </Button>
        </div>
      </div>
    </main>
  )
}

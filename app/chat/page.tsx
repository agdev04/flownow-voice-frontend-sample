import WebSocketChat from "@/components/websocket-chat"

export default function ChatPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4">
      <WebSocketChat />
    </main>
  )
}

import { ChatView } from "@/components/dashboard/chat-view";

export default function ChatPage() {
  return (
    <div className="h-[calc(100dvh-60px)] lg:h-screen flex flex-col">
      <ChatView />
    </div>
  );
}

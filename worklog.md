---
Task ID: 1
Agent: Main Agent
Task: Fix agent identity bleed and notification mark-all-as-read bugs

Work Log:
- Analyzed screenshot showing Data Agent responding as "Claw General" with all tools
- Deep-dived into chat-view.tsx, route.ts, agents.ts, notification-context.tsx
- Identified root cause of identity bleed: useChat hook stores transport in a ref on first mount, ignoring prop changes. useMemo transport + setMessages([]) was insufficient.
- Fixed by extracting useChat into separate AgentChatSession component rendered with key={selectedAgent}, forcing complete React remount on agent switch
- Fixed markAllAsRead: now clears notifications entirely instead of just marking them read. Added dismissedSourceIdsRef for client-side dedup safety net.
- Added debug logging to chat route for agentId verification
- Committed changes but could not deploy (no Vercel/GitHub auth in this session)

Stage Summary:
- chat-view.tsx: Major refactor - split into ChatView (parent with agent picker) and AgentChatSession (isolated useChat with key-based remount)
- notification-context.tsx: markAllAsRead now clears list + tracks dismissed IDs; dismiss and clearAll also track dismissed IDs
- route.ts: Added debug logging for agentId and tools
- All changes committed locally, pending manual deploy

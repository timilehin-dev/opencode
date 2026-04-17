---
Task ID: 1
Agent: Main
Task: Update AIHubMix API keys, fix agent system, and test all 7 agents

Work Log:
- Updated 4 AIHubMix API keys (KEY_1, KEY_3, KEY_4, KEY_5) on Vercel via REST API
- Expanded shared key pool in agents.ts from 2 to 5 keys
- Discovered old model name `coding-glm-5-turbo-free` is deprecated on new keys
- Updated model to `coding-glm-5.1-free` for General agent
- Moved Code Agent and Research Agent from AIHubMix to Ollama (rate limit fix)
- Fixed web_search and web_reader tools with multi-layer fallback (Z.ai → DDG → Wikipedia → Brave)
- Fixed web_search to use POST request for DuckDuckGo (avoids JS challenge)
- Deployed 5 times to production with progressive fixes
- Tested all 7 agents for identity and tool calling

Stage Summary:
- All 4 new AIHubMix keys deployed on Vercel (production + preview + development)
- Model updated: coding-glm-5-turbo-free → coding-glm-5.1-free
- Only General agent uses AIHubMix (coding-glm-5.1-free, shared pool of 5 keys)
- Code, Research moved to Ollama (gemma4:31b-cloud) to avoid rate limits
- Web search/reader: dual-mode Z.ai SDK + DuckDuckGo POST + Wikipedia + Brave fallback
- All 7 agents tested successfully with proper identity and working tools
- General agent takes ~50-60s due to reasoning tokens (GLM-5.1 thinking model)
- DuckDuckGo HTML blocked on Vercel IPs; Wikipedia fallback provides search results

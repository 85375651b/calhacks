"""Agentverse/ASI:One entry point implementing Agent Chat Protocol 0.3.0."""
import asyncio
import os
from pathlib import Path

from dotenv import load_dotenv
from uagents import Agent, Context, Protocol
from uagents_core.contrib.protocols.chat import ChatAcknowledgement, ChatMessage, TextContent, chat_protocol_spec

from coordinator import Coordinator, History

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / "server" / ".env")


def build_agent():
    seed = os.getenv("AGENT_SEED", "")
    coordinator = Coordinator(
        api_key=os.getenv("ASI1_API_KEY", ""), bridge_token=os.getenv("AGENT_BRIDGE_TOKEN", ""), seed=seed,
        backend_url=os.getenv("AGENT_BACKEND_URL", "http://127.0.0.1:3102"),
        history=History(ROOT / "server" / "data" / "agent-conversations.sqlite"),
        model=os.getenv("ASI1_MODEL", "asi1"),
    )
    if chat_protocol_spec.name != "AgentChatProtocol" or str(chat_protocol_spec.version) != "0.3.0":
        raise RuntimeError("Expected AgentChatProtocol 0.3.0; check requirements.txt.")
    agent = Agent(name="PropertyLens Home and IKEA Planner", seed=seed,
                  port=int(os.getenv("AGENT_PORT", "8001")), mailbox=True, publish_agent_details=True)
    protocol = Protocol(spec=chat_protocol_spec)
    locks = {}

    @protocol.on_message(ChatMessage)
    async def handle_message(ctx: Context, sender: str, msg: ChatMessage):
        await ctx.send(sender, ChatAcknowledgement(acknowledged_msg_id=msg.msg_id))
        text = "\n".join(part.text for part in msg.content if isinstance(part, TextContent))
        conversation = str(ctx.session or "default")
        key = coordinator.session_key(sender, conversation)
        lock = locks.setdefault(key, asyncio.Lock())
        async with lock:
            try:
                reply = await asyncio.to_thread(coordinator.respond, sender, conversation, str(msg.msg_id), text)
            except Exception:
                ctx.logger.error("Coordinator failed; check API key and backend availability. Credentials are not logged.")
                reply = "I could not finish this request. Check the agent's API key and planner connection; saved results have not been discarded."
            await ctx.send(sender, ChatMessage(content=[TextContent(type="text", text=reply)]))
        # Keep the session open for confirmations and follow-up placement edits.

    @protocol.on_message(ChatAcknowledgement)
    async def handle_ack(ctx: Context, sender: str, msg: ChatAcknowledgement):
        pass

    agent.include(protocol, publish_manifest=True)
    return agent


if __name__ == "__main__":
    build_agent().run()
